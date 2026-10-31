import type { Explanation } from "../api";
import {
  DEFAULT_ITERATIONS,
  DecryptionError,
  type Sealed,
  decodeRecoveryKey,
  encodeRecoveryKey,
  importDataKey,
  keyFromPassphrase,
  keyFromRecovery,
  newRecoveryBytes,
  open,
  openJson,
  randomBytes,
  seal,
  sealJson,
} from "./crypto";

/** Where encrypted bytes live. Implemented over IndexedDB in the web app and in memory for tests. */
export interface VaultStorage {
  getMeta(): Promise<StoredVault | undefined>;
  putMeta(meta: StoredVault): Promise<void>;
  getDoc(id: string): Promise<StoredDoc | undefined>;
  putDoc(doc: StoredDoc): Promise<void>;
  deleteDoc(id: string): Promise<void>;
  listDocs(): Promise<StoredDoc[]>;
  clear(): Promise<void>;
}

/** Everything here is safe to store: only wrapped (encrypted) copies of the data key. */
export interface StoredVault {
  version: 1;
  iterations: number;
  passphraseSalt: Uint8Array<ArrayBuffer>;
  wrappedByPassphrase: Sealed;
  recoverySalt: Uint8Array<ArrayBuffer>;
  wrappedByRecovery: Sealed;
}

/** Only an id and a date are readable without the key. Title, text and explanation are encrypted. */
export interface StoredDoc {
  id: string;
  createdAt: number;
  sealed: Sealed;
}

export interface SavedDocument {
  title: string;
  text: string;
  explanation: Explanation;
}

export interface DocumentSummary {
  id: string;
  title: string;
  createdAt: number;
}

export const MIN_PASSPHRASE_LENGTH = 12;

export class VaultError extends Error {
  constructor(
    readonly code:
      "locked" | "exists" | "missing" | "weak-passphrase" | "bad-recovery-key",
    message: string,
  ) {
    super(message);
  }
}

const DEK_AAD = "amcn-vault-v1:dek";
const docAad = (id: string) => `amcn-doc-v1:${id}`;

export function checkPassphrase(passphrase: string): string | null {
  if (passphrase.normalize("NFKC").length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters. A few random words in a row works well.`;
  }
  return null;
}

export function createVault(
  storage: VaultStorage,
  options: { iterations?: number } = {},
) {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  let dek: { raw: Uint8Array<ArrayBuffer>; key: CryptoKey } | null = null;

  const requireKey = () => {
    if (!dek) throw new VaultError("locked", "The vault is locked.");
    return dek.key;
  };

  async function load() {
    const meta = await storage.getMeta();
    if (!meta) throw new VaultError("missing", "No vault has been set up yet.");
    return meta;
  }

  async function adopt(raw: Uint8Array<ArrayBuffer>) {
    dek = { raw, key: await importDataKey(raw) };
  }

  async function wrapWithPassphrase(
    raw: Uint8Array<ArrayBuffer>,
    passphrase: string,
  ) {
    const salt = randomBytes(16);
    const kek = await keyFromPassphrase(passphrase, salt, iterations);
    return {
      passphraseSalt: salt,
      wrappedByPassphrase: await seal(kek, raw, DEK_AAD),
    };
  }

  return {
    get unlocked() {
      return dek !== null;
    },

    async exists() {
      return (await storage.getMeta()) !== undefined;
    },

    /** Creates the vault and returns the recovery key. It is shown once and never stored. */
    async create(passphrase: string): Promise<{ recoveryKey: string }> {
      if (await storage.getMeta())
        throw new VaultError("exists", "A vault already exists.");
      const weak = checkPassphrase(passphrase);
      if (weak) throw new VaultError("weak-passphrase", weak);

      const raw = randomBytes(32);
      const recoveryBytes = newRecoveryBytes();
      const recoverySalt = randomBytes(16);
      const recoveryKek = await keyFromRecovery(recoveryBytes, recoverySalt);
      await storage.putMeta({
        version: 1,
        iterations,
        ...(await wrapWithPassphrase(raw, passphrase)),
        recoverySalt,
        wrappedByRecovery: await seal(recoveryKek, raw, DEK_AAD),
      });
      await adopt(raw);
      return { recoveryKey: encodeRecoveryKey(recoveryBytes) };
    },

    /** Throws DecryptionError on a wrong passphrase. */
    async unlock(passphrase: string) {
      const meta = await load();
      const kek = await keyFromPassphrase(
        passphrase,
        meta.passphraseSalt,
        meta.iterations,
      );
      await adopt(await open(kek, meta.wrappedByPassphrase, DEK_AAD));
    },

    /** Unlock with the recovery key, then set a new passphrase (the old one is no longer usable). */
    async resetWithRecoveryKey(recoveryKey: string, newPassphrase: string) {
      const bytes = decodeRecoveryKey(recoveryKey);
      if (!bytes)
        throw new VaultError(
          "bad-recovery-key",
          "That recovery key doesn't look right. Check it and try again.",
        );
      const weak = checkPassphrase(newPassphrase);
      if (weak) throw new VaultError("weak-passphrase", weak);
      const meta = await load();
      const kek = await keyFromRecovery(bytes, meta.recoverySalt);
      const raw = await open(kek, meta.wrappedByRecovery, DEK_AAD);
      await storage.putMeta({
        ...meta,
        ...(await wrapWithPassphrase(raw, newPassphrase)),
      });
      await adopt(raw);
    },

    async changePassphrase(current: string, next: string) {
      const weak = checkPassphrase(next);
      if (weak) throw new VaultError("weak-passphrase", weak);
      const meta = await load();
      const kek = await keyFromPassphrase(
        current,
        meta.passphraseSalt,
        meta.iterations,
      );
      const raw = await open(kek, meta.wrappedByPassphrase, DEK_AAD);
      await storage.putMeta({
        ...meta,
        ...(await wrapWithPassphrase(raw, next)),
      });
      await adopt(raw);
    },

    /** Forget the key. Best effort: zero the raw bytes we hold. */
    lock() {
      dek?.raw.fill(0);
      dek = null;
    },

    async save(doc: SavedDocument): Promise<string> {
      const key = requireKey();
      const id = crypto.randomUUID();
      await storage.putDoc({
        id,
        createdAt: Date.now(),
        sealed: await sealJson(key, doc, docAad(id)),
      });
      return id;
    },

    async get(id: string): Promise<SavedDocument> {
      const key = requireKey();
      const stored = await storage.getDoc(id);
      if (!stored)
        throw new VaultError("missing", "That document is no longer saved.");
      return openJson<SavedDocument>(key, stored.sealed, docAad(id));
    },

    /** Newest first. Documents that fail to decrypt are skipped rather than breaking the list. */
    async list(): Promise<DocumentSummary[]> {
      const key = requireKey();
      const out: DocumentSummary[] = [];
      for (const d of await storage.listDocs()) {
        try {
          const { title } = await openJson<SavedDocument>(
            key,
            d.sealed,
            docAad(d.id),
          );
          out.push({ id: d.id, title, createdAt: d.createdAt });
        } catch (e) {
          if (!(e instanceof DecryptionError)) throw e;
        }
      }
      return out.sort((a, b) => b.createdAt - a.createdAt);
    },

    async remove(id: string) {
      requireKey();
      await storage.deleteDoc(id);
    },

    /** Delete the vault and every saved document. Allowed while locked so a forgotten passphrase can be escaped. */
    async eraseEverything() {
      this.lock();
      await storage.clear();
    },
  };
}

export type Vault = ReturnType<typeof createVault>;

export function createMemoryStorage(): VaultStorage & { dump(): string } {
  let meta: StoredVault | undefined;
  const docs = new Map<string, StoredDoc>();
  return {
    getMeta: async () => meta,
    putMeta: async (m) => void (meta = m),
    getDoc: async (id) => docs.get(id),
    putDoc: async (d) => void docs.set(d.id, d),
    deleteDoc: async (id) => void docs.delete(id),
    listDocs: async () => [...docs.values()],
    clear: async () => {
      meta = undefined;
      docs.clear();
    },
    dump: () =>
      JSON.stringify([meta, [...docs.values()]], (_k, v) =>
        v instanceof Uint8Array ? Array.from(v) : v,
      ),
  };
}
