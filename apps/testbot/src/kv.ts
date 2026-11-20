// Bot replacement for the app's device store (apps/mobile/src/chat/kv.ts): one JSON file on the
// bot's private volume, rewritten atomically after each change. Same interface as the app's kv.
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.env.BOT_DATA_DIR ?? './data', 'kv.json');
let mem: Record<string, unknown> | null = null;

function load() {
  if (mem) return mem;
  try {
    mem = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    mem = {};
  }
  return mem;
}

function flush() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(mem));
  fs.renameSync(tmp, file);
}

export const kv = {
  async get<T>(k: string): Promise<T | null> {
    const v = load()[k];
    return v === undefined ? null : (structuredClone(v) as T);
  },
  async set(k: string, v: unknown) {
    load()[k] = structuredClone(v);
    flush();
  },
  async del(k: string) {
    delete load()[k];
    flush();
  },
  async keys(prefix: string) {
    return Object.keys(load()).filter((k) => k.startsWith(prefix));
  },
  async getPrefix<T>(prefix: string): Promise<T[]> {
    const m = load();
    return Object.keys(m)
      .filter((k) => k.startsWith(prefix))
      .map((k) => structuredClone(m[k]) as T);
  },
  async delPrefix(prefix: string) {
    const m = load();
    for (const k of Object.keys(m)) if (k.startsWith(prefix)) delete m[k];
    flush();
  },
  async wipe() {
    mem = {};
    flush();
  },
};
