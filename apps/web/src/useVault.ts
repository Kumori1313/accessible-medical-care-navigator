import {
  DecryptionError,
  type DocumentSummary,
  type SavedDocument,
  type Vault,
  VaultError,
} from "@amcn/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type VaultStatus =
  "loading" | "unavailable" | "none" | "locked" | "unlocked";

export interface VaultApi {
  status: VaultStatus;
  docs: DocumentSummary[];
  busy: boolean;
  error: string;
  /** Set when the vault locked itself after inactivity, so the UI can say why. */
  autoLocked: boolean;
  create(passphrase: string): Promise<string | undefined>;
  unlock(passphrase: string): Promise<boolean>;
  recover(recoveryKey: string, newPassphrase: string): Promise<boolean>;
  lock(): void;
  save(doc: SavedDocument): Promise<boolean>;
  open(id: string): Promise<SavedDocument | undefined>;
  remove(id: string): Promise<void>;
  erase(): Promise<void>;
  clearError(): void;
}

function describe(e: unknown): string {
  if (e instanceof DecryptionError)
    return "That didn't work. Check what you typed and try again.";
  if (e instanceof VaultError) return e.message;
  return "Something went wrong with saved documents. Please try again.";
}

/**
 * Owns the vault's lifecycle for the UI. The key lives only inside the vault object, in memory;
 * locking (manually or after inactivity) drops it.
 */
export function useVault(
  vault: Vault | null,
  autoLockMinutes: number,
): VaultApi {
  const [status, setStatus] = useState<VaultStatus>(
    vault ? "loading" : "unavailable",
  );
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autoLocked, setAutoLocked] = useState(false);

  useEffect(() => {
    if (!vault) return;
    let live = true;
    vault.exists().then(
      (exists) => live && setStatus(exists ? "locked" : "none"),
      () => live && setStatus("unavailable"),
    );
    return () => {
      live = false;
    };
  }, [vault]);

  const refresh = useCallback(async () => {
    if (vault) setDocs(await vault.list());
  }, [vault]);

  const guard = useCallback(
    async <T>(task: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError("");
      try {
        return await task();
      } catch (e) {
        setError(describe(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const lock = useCallback(() => {
    vault?.lock();
    setDocs([]);
    setStatus((s) => (s === "unlocked" ? "locked" : s));
  }, [vault]);

  // Lock again after a period without interaction.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (status !== "unlocked" || autoLockMinutes <= 0) return;
    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        lock();
        setAutoLocked(true);
      }, autoLockMinutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "touchstart", "focusin"] as const;
    events.forEach((ev) => window.addEventListener(ev, arm));
    arm();
    return () => {
      clearTimeout(timer.current);
      events.forEach((ev) => window.removeEventListener(ev, arm));
    };
  }, [status, autoLockMinutes, lock]);

  return {
    status,
    docs,
    busy,
    error,
    autoLocked,
    clearError: () => setError(""),
    lock,
    async create(passphrase) {
      if (!vault) return undefined;
      return guard(async () => {
        const { recoveryKey } = await vault.create(passphrase);
        setAutoLocked(false);
        setStatus("unlocked");
        await refresh();
        return recoveryKey;
      });
    },
    async unlock(passphrase) {
      if (!vault) return false;
      const ok = await guard(async () => {
        await vault.unlock(passphrase);
        setAutoLocked(false);
        setStatus("unlocked");
        await refresh();
        return true;
      });
      return ok === true;
    },
    async recover(recoveryKey, newPassphrase) {
      if (!vault) return false;
      const ok = await guard(async () => {
        await vault.resetWithRecoveryKey(recoveryKey, newPassphrase);
        setAutoLocked(false);
        setStatus("unlocked");
        await refresh();
        return true;
      });
      return ok === true;
    },
    async save(doc) {
      if (!vault) return false;
      const ok = await guard(async () => {
        await vault.save(doc);
        await refresh();
        return true;
      });
      return ok === true;
    },
    async open(id) {
      if (!vault) return undefined;
      return guard(() => vault.get(id));
    },
    async remove(id) {
      if (!vault) return;
      await guard(async () => {
        await vault.remove(id);
        await refresh();
      });
    },
    async erase() {
      if (!vault) return;
      await guard(async () => {
        await vault.eraseEverything();
        setDocs([]);
        setStatus("none");
      });
    },
  };
}
