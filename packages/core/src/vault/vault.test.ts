import { describe, expect, it } from "vitest";
import type { Explanation } from "../api";
import {
  DecryptionError,
  decodeRecoveryKey,
  encodeRecoveryKey,
} from "./crypto";
import { VaultError, createMemoryStorage, createVault } from "./vault";

const PASS = "correct horse battery staple";
const explanation: Explanation = {
  document_type: "Intake form",
  summary: "Secret summary text",
  sections: [],
  uncertain: [],
};
const doc = {
  title: "Dr Smith intake",
  text: "Patient Jane Roe, SSN 123-45-6789",
  explanation,
};
const fast = { iterations: 1000 }; // PBKDF2 at full cost is deliberately slow

describe("recovery key encoding", () => {
  it("round-trips and tolerates formatting and look-alike characters", () => {
    const bytes = new Uint8Array(
      Array.from({ length: 20 }, (_, i) => i * 13 + 5),
    );
    const text = encodeRecoveryKey(bytes);
    expect(text).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    expect(decodeRecoveryKey(text)).toEqual(bytes);
    expect(decodeRecoveryKey(text.toLowerCase().replaceAll("-", " "))).toEqual(
      bytes,
    );
    expect(
      decodeRecoveryKey(text.replaceAll("0", "o").replaceAll("1", "l")),
    ).toEqual(bytes);
  });
  it("rejects malformed input", () => {
    expect(decodeRecoveryKey("TOO-SHORT")).toBeNull();
    expect(decodeRecoveryKey("U".repeat(32))).toBeNull();
  });
});

describe("vault", () => {
  async function fresh() {
    const storage = createMemoryStorage();
    const vault = createVault(storage, fast);
    const { recoveryKey } = await vault.create(PASS);
    return { storage, vault, recoveryKey };
  }

  it("rejects short passphrases and double creation", async () => {
    const vault = createVault(createMemoryStorage(), fast);
    await expect(vault.create("short")).rejects.toMatchObject({
      code: "weak-passphrase",
    });
    await vault.create(PASS);
    await expect(vault.create(PASS)).rejects.toMatchObject({ code: "exists" });
  });

  it("saves, lists and reads documents; nothing sensitive is stored in the clear", async () => {
    const { storage, vault } = await fresh();
    const id = await vault.save(doc);
    expect((await vault.list()).map((d) => d.title)).toEqual([
      "Dr Smith intake",
    ]);
    expect(await vault.get(id)).toEqual(doc);
    const stored = storage.dump();
    for (const secret of [
      "Jane",
      "123-45-6789",
      "Secret summary",
      "Dr Smith",
      PASS,
    ]) {
      expect(stored).not.toContain(secret);
    }
  });

  it("lock forgets the key; unlock needs the right passphrase", async () => {
    const { vault } = await fresh();
    const id = await vault.save(doc);
    vault.lock();
    expect(vault.unlocked).toBe(false);
    await expect(vault.get(id)).rejects.toMatchObject({ code: "locked" });
    await expect(vault.save(doc)).rejects.toBeInstanceOf(VaultError);
    await expect(vault.unlock("wrong passphrase!!")).rejects.toBeInstanceOf(
      DecryptionError,
    );
    expect(vault.unlocked).toBe(false);
    await vault.unlock(PASS);
    expect((await vault.get(id)).text).toBe(doc.text);
  });

  it("a second session over the same storage can unlock", async () => {
    const { storage, vault } = await fresh();
    const id = await vault.save(doc);
    const again = createVault(storage, fast);
    await again.unlock(PASS);
    expect((await again.get(id)).title).toBe(doc.title);
  });

  it("the recovery key resets the passphrase and keeps documents readable", async () => {
    const { storage, vault, recoveryKey } = await fresh();
    const id = await vault.save(doc);
    vault.lock();
    await expect(
      vault.resetWithRecoveryKey("nope", "a brand new passphrase"),
    ).rejects.toMatchObject({
      code: "bad-recovery-key",
    });
    await vault.resetWithRecoveryKey(
      recoveryKey.toLowerCase(),
      "a brand new passphrase",
    );
    expect((await vault.get(id)).text).toBe(doc.text);
    const later = createVault(storage, fast);
    await expect(later.unlock(PASS)).rejects.toBeInstanceOf(DecryptionError);
    await later.unlock("a brand new passphrase");
  });

  it("a wrong recovery key does not unlock", async () => {
    const { vault } = await fresh();
    vault.lock();
    const other = encodeRecoveryKey(new Uint8Array(20).fill(7));
    await expect(
      vault.resetWithRecoveryKey(other, "a brand new passphrase"),
    ).rejects.toBeInstanceOf(DecryptionError);
    expect(vault.unlocked).toBe(false);
  });

  it("changes the passphrase only when the current one is right", async () => {
    const { storage, vault } = await fresh();
    await expect(
      vault.changePassphrase("wrong wrong wrong", "another long passphrase"),
    ).rejects.toBeInstanceOf(DecryptionError);
    await vault.changePassphrase(PASS, "another long passphrase");
    await createVault(storage, fast).unlock("another long passphrase");
  });

  it("ciphertext cannot be moved to another document id", async () => {
    const { storage, vault } = await fresh();
    const a = await vault.save(doc);
    const b = await vault.save({ ...doc, title: "Other" });
    const stored = (await storage.getDoc(a))!;
    await storage.putDoc({
      ...(await storage.getDoc(b))!,
      sealed: stored.sealed,
    });
    await expect(vault.get(b)).rejects.toBeInstanceOf(DecryptionError);
    // The list skips the tampered record instead of failing entirely.
    expect((await vault.list()).map((d) => d.id)).toEqual([a]);
  });

  it("removes documents and erases everything even while locked", async () => {
    const { storage, vault } = await fresh();
    const id = await vault.save(doc);
    await vault.remove(id);
    expect(await vault.list()).toEqual([]);
    vault.lock();
    await vault.eraseEverything();
    expect(await vault.exists()).toBe(false);
    expect(await storage.listDocs()).toEqual([]);
  });
});
