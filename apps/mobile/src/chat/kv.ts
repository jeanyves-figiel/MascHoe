// Device store (data-model.md › Device-only): SQLCipher database, key in the Keychain.
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { hex, rand } from './bytes';

let db: SQLite.SQLiteDatabase | null = null;

async function open() {
  if (db) return db;
  let key = await SecureStore.getItemAsync('thirstr.dbkey');
  if (!key) {
    key = hex(rand(32));
    await SecureStore.setItemAsync('thirstr.dbkey', key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  }
  const d = await SQLite.openDatabaseAsync('thirstr.db');
  await d.execAsync(`PRAGMA key = "x'${key}'"; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);`);
  db = d;
  return d;
}

const like = (prefix: string) => prefix.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

export const kv = {
  async get<T>(k: string): Promise<T | null> {
    const r = await (await open()).getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', k);
    return r ? (JSON.parse(r.v) as T) : null;
  },
  async set(k: string, v: unknown) {
    await (await open()).runAsync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', k, JSON.stringify(v));
  },
  async del(k: string) {
    await (await open()).runAsync('DELETE FROM kv WHERE k = ?', k);
  },
  async keys(prefix: string): Promise<string[]> {
    const rows = await (await open()).getAllAsync<{ k: string }>("SELECT k FROM kv WHERE k LIKE ? ESCAPE '\\'", like(prefix));
    return rows.map((r) => r.k);
  },
  /** All values whose key starts with `prefix`, in one query (per-message rows, R-07.21). */
  async getPrefix<T>(prefix: string): Promise<T[]> {
    const rows = await (await open()).getAllAsync<{ v: string }>("SELECT v FROM kv WHERE k LIKE ? ESCAPE '\\'", like(prefix));
    return rows.map((r) => JSON.parse(r.v) as T);
  },
  async delPrefix(prefix: string) {
    await (await open()).runAsync("DELETE FROM kv WHERE k LIKE ? ESCAPE '\\'", like(prefix));
  },
  async wipe() {
    await (await open()).runAsync('DELETE FROM kv');
  },
};
