/** Thin, dependency-free wrappers over Web Crypto. All keys are AES-GCM 256. */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const DEFAULT_ITERATIONS = 600_000; // OWASP guidance for PBKDF2-HMAC-SHA256

export class DecryptionError extends Error {
  constructor() {
    super("Could not decrypt: wrong passphrase or damaged data.");
  }
}

export const randomBytes = (n: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(out);
  return out;
};

/** Normalise so the same passphrase typed on different keyboards/IMEs derives the same key. */
export const normalizePassphrase = (p: string) => p.normalize("NFKC");

export async function keyFromPassphrase(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(normalizePassphrase(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Recovery keys are already high-entropy random, so a fast HKDF is enough. */
export async function keyFromRecovery(
  secret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
) {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: enc.encode("amcn-recovery-v1"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export const importDataKey = (raw: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
}

/** `aad` binds the ciphertext to its context (e.g. a record id) so it can't be moved elsewhere. */
export async function seal(
  key: CryptoKey,
  plain: Uint8Array<ArrayBuffer>,
  aad: string,
): Promise<Sealed> {
  const iv = randomBytes(12);
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    plain,
  );
  return { iv, data: new Uint8Array(buf) };
}

export async function open(
  key: CryptoKey,
  sealed: Sealed,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const buf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: sealed.iv, additionalData: enc.encode(aad) },
      key,
      sealed.data,
    );
    return new Uint8Array(buf);
  } catch {
    throw new DecryptionError();
  }
}

export const sealJson = (key: CryptoKey, value: unknown, aad: string) =>
  seal(key, enc.encode(JSON.stringify(value)), aad);

export async function openJson<T>(
  key: CryptoKey,
  sealed: Sealed,
  aad: string,
): Promise<T> {
  return JSON.parse(dec.decode(await open(key, sealed, aad))) as T;
}

// Recovery key: 160 random bits written as 32 Crockford base32 symbols in groups of four.
// Crockford omits I, L, O, U; when typed back, O reads as 0 and I/L as 1, so common mix-ups still work.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_BYTES = 20;

export const newRecoveryBytes = () => randomBytes(RECOVERY_BYTES);

export function encodeRecoveryKey(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{1,4}/g)!.join("-");
}

/** Returns null for anything that is not a well-formed recovery key. */
export function decodeRecoveryKey(
  text: string,
): Uint8Array<ArrayBuffer> | null {
  const cleaned = text
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== 32) return null;
  const out = new Uint8Array(new ArrayBuffer(RECOVERY_BYTES));
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return out;
}
