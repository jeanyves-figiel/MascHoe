// SR-15 (#155): only the most recently used chats stay decrypted in memory; others reload from disk.
import { expect, jest, test } from '@jest/globals';

const mockRows = new Map<string, unknown>();
const mockReads: string[] = [];
jest.mock('../src/chat/kv', () => ({
  kv: {
    get: async (k: string) => mockRows.get(k) ?? null,
    set: async (k: string, v: unknown) => void mockRows.set(k, v),
    del: async (k: string) => void mockRows.delete(k),
    delPrefix: async () => {},
    getPrefix: async (p: string) => {
      mockReads.push(p);
      return [...mockRows].filter(([k]) => k.startsWith(p)).map(([, v]) => v);
    },
  },
}));

import * as store from '../src/chat/store';

test('keeps 12 chats in memory, reloads an evicted one with its messages', async () => {
  for (let i = 0; i < 13; i++) await store.put(`c${i}`, { id: `m${i}`, at: i });
  mockReads.length = 0;
  expect((await store.all('c12')).map((r) => r.id)).toEqual(['m12']);
  expect(mockReads).toEqual([]); // recent: from memory
  expect((await store.all('c0')).map((r) => r.id)).toEqual(['m0']);
  expect(mockReads).toEqual(['m:c0\u0001']); // evicted: read again from the encrypted store
});
