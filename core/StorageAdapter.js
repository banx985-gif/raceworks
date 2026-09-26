// Key → value storage. All adapters share: async get(key), set(key, value), remove(key).
// createStorageAdapter() picks IndexedDB, falls back to localStorage, then to memory (nothing persists).
export class IndexedDbAdapter {
  constructor(dbName = 'canvas-series', storeName = 'saves') {
    this.kind = 'indexeddb';
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB not available'));
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  _run(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, mode);
      const req = fn(tx.objectStore(this.storeName));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async get(key) {
    const v = await this._run('readonly', (s) => s.get(key));
    return v ?? null;
  }

  set(key, value) {
    return this._run('readwrite', (s) => s.put(value, key));
  }

  remove(key) {
    return this._run('readwrite', (s) => s.delete(key));
  }
}

export class LocalStorageAdapter {
  constructor(prefix = 'canvas-series:') {
    this.kind = 'localstorage';
    this.prefix = prefix;
  }

  async get(key) {
    const raw = localStorage.getItem(this.prefix + key);
    return raw == null ? null : JSON.parse(raw);
  }

  async set(key, value) {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  async remove(key) {
    localStorage.removeItem(this.prefix + key);
  }
}

export class MemoryAdapter {
  constructor() {
    this.kind = 'memory';
    this.map = new Map();
  }

  async get(key) {
    return this.map.has(key) ? structuredClone(this.map.get(key)) : null;
  }

  async set(key, value) {
    this.map.set(key, structuredClone(value));
  }

  async remove(key) {
    this.map.delete(key);
  }
}

export async function createStorageAdapter({ dbName = 'canvas-series', prefix = 'canvas-series:' } = {}) {
  try {
    return await new IndexedDbAdapter(dbName).open();
  } catch (err) {
    console.warn('[Storage] IndexedDB unavailable, using localStorage', err);
  }
  try {
    const probe = `${prefix}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalStorageAdapter(prefix);
  } catch (err) {
    console.warn('[Storage] localStorage unavailable, saves will not persist', err);
  }
  return new MemoryAdapter();
}
