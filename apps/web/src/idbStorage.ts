import type { StoredDoc, StoredVault, VaultStorage } from "@amcn/core";

const DB_NAME = "amcn-vault";
const META_KEY = "vault";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("meta");
      req.result.createObjectStore("docs", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("Could not open storage."));
  });
}

function run<T>(
  store: "meta" | "docs",
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = op(tx.objectStore(store));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("Storage failed."));
        };
      }),
  );
}

/** Encrypted vault data in IndexedDB. Only ciphertext and wrapped keys ever reach this layer. */
export function createIdbStorage(): VaultStorage {
  return {
    getMeta: () =>
      run<StoredVault | undefined>("meta", "readonly", (s) => s.get(META_KEY)),
    putMeta: async (m) =>
      void (await run("meta", "readwrite", (s) => s.put(m, META_KEY))),
    getDoc: (id) =>
      run<StoredDoc | undefined>("docs", "readonly", (s) => s.get(id)),
    putDoc: async (d) => void (await run("docs", "readwrite", (s) => s.put(d))),
    deleteDoc: async (id) =>
      void (await run("docs", "readwrite", (s) => s.delete(id))),
    listDocs: () => run<StoredDoc[]>("docs", "readonly", (s) => s.getAll()),
    clear: async () => {
      await run("meta", "readwrite", (s) => s.clear());
      await run("docs", "readwrite", (s) => s.clear());
    },
  };
}

export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
