/* ============ IndexedDB 封装（纯手写 Promise 化） ============ */

const DB_NAME = 'AppleAI';
const DB_VERSION = 3;

const STORE_DEFS = {
  conversations: { key: 'id', indexes: { updatedAt: 'updatedAt' } },
  messages: { key: 'id', indexes: { conversationId: 'conversationId,timestamp', status: 'status' } },
  photos: { key: 'id', indexes: { uploadDate: 'uploadDate' } },
  music: { key: 'id', indexes: { addedAt: 'addedAt' } },
  recordings: { key: 'id', indexes: { createdAt: 'createdAt' } },
  notes: { key: 'id', indexes: { updatedAt: 'updatedAt' } },
  events: { key: 'id', indexes: { start: 'start' } },
  contacts: { key: 'id', indexes: { pinyin: 'pinyin' } },
  moments: { key: 'id', indexes: { createdAt: 'createdAt' } },
  bookmarks: { key: 'id', indexes: { visitedAt: 'visitedAt' } },
  history: { key: 'id', indexes: { visitedAt: 'visitedAt' } },
  settings: { key: 'key' },
  stickers: { key: 'id' },
  wallpapers: { key: 'id', indexes: { addedAt: 'addedAt' } },
};

function req2promise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const DB = {
  _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        for (const [name, def] of Object.entries(STORE_DEFS)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: def.key });
            if (def.indexes) {
              for (const [iname, ikey] of Object.entries(def.indexes)) {
                const parts = ikey.split(',');
                store.createIndex(iname, parts.length > 1 ? parts : parts[0], { unique: false });
              }
            }
          }
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => {
        // 版本回退兼容：本机数据库版本高于代码声明（如旧会话遗留 v3+）时，
        // 改为不指定版本打开（以现有版本运行，不触发升级），避免启动失败
        if (req.error && req.error.name === 'VersionError') {
          const req2 = indexedDB.open(DB_NAME);
          req2.onsuccess = () => { this._db = req2.result; resolve(req2.result); };
          req2.onerror = () => reject(req2.error);
        } else {
          reject(req.error);
        }
      };
    });
  },

  async _store(name, mode = 'readonly') {
    const db = await this.open();
    return db.transaction(name, mode).objectStore(name);
  },

  async put(name, value) {
    const store = await this._store(name, 'readwrite');
    return req2promise(store.put(value));
  },

  async bulkPut(name, values) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      const store = tx.objectStore(name);
      values.forEach(v => store.put(v));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  async get(name, key) {
    const store = await this._store(name);
    return req2promise(store.get(key));
  },

  async del(name, key) {
    const store = await this._store(name, 'readwrite');
    return req2promise(store.delete(key));
  },

  async all(name) {
    const store = await this._store(name);
    return req2promise(store.getAll());
  },

  /** 按索引查询（返回按主键顺序），query 为 IDBKeyRange 或精确值；复合索引自动前缀匹配 */
  async byIndex(name, indexName, query = null, reverse = true) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readonly');
      const idx = tx.objectStore(name).index(indexName);
      // 复合索引 + 单值 → 前缀范围匹配（[value] ~ [value, 高位键]）
      if (query != null && !(query instanceof IDBKeyRange) && Array.isArray(idx.keyPath)) {
        query = IDBKeyRange.bound([query], [query, '\uffff'], false, true);
      }
      const results = [];
      const req = idx.openCursor(query, reverse ? 'prev' : 'next');
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { results.push(cursor.value); cursor.continue(); }
        else resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async byIndexRange(name, indexName, lower, upper, reverse = true) {
    const query = IDBKeyRange.bound(lower, upper);
    return this.byIndex(name, indexName, query, reverse);
  },

  async count(name) {
    const store = await this._store(name);
    return req2promise(store.count());
  },

  async clear(name) {
    const store = await this._store(name, 'readwrite');
    return req2promise(store.clear());
  },

  /** 导出全部数据 */
  async exportAll() {
    const data = { _meta: { app: 'AppleAI Web', version: DB_VERSION, exportedAt: Date.now() } };
    for (const name of Object.keys(STORE_DEFS)) {
      data[name] = await this.all(name);
    }
    return data;
  },

  async importAll(data) {
    for (const name of Object.keys(STORE_DEFS)) {
      if (Array.isArray(data[name])) {
        await this.clear(name);
        await this.bulkPut(name, data[name]);
      }
    }
  },
};

/* ============ 设置中心（settings 表 KV 封装） ============ */
import { Bus } from './utils.js';

export const Settings = {
  _cache: {},

  async load(key, def = null) {
    const row = await DB.get('settings', key);
    const val = row ? row.value : def;
    this._cache[key] = val;
    return val;
  },

  get(key, def = null) {
    if (key in this._cache) return this._cache[key];
    return def;
  },

  async set(key, value) {
    this._cache[key] = value;
    await DB.put('settings', { key, value });
    Bus.emit('settings:' + key, value);
    return value;
  },

  async setQuiet(key, value) {
    this._cache[key] = value;
    await DB.put('settings', { key, value });
  },
};
