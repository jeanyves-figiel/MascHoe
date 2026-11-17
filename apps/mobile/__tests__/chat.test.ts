import { describe, expect, it, jest } from '@jest/globals';
import { installSubtle } from '../src/crypto/subtleShim';
import { concat, fromB64, fromUtf8, hex, toB64, utf8 } from '../src/chat/bytes';
import { firstMessageProblem } from '../src/chat/rules';

jest.mock('../src/chat/kv', () => {
  // One store per simulated device; tests switch with globalThis.__dev.
  const stores = new Map<string, Map<string, unknown>>();
  const m = () => {
    const d = (globalThis as { __dev?: string }).__dev ?? 'x';
    if (!stores.has(d)) stores.set(d, new Map());
    return stores.get(d)!;
  };
  return {
    kv: {
      get: async (k: string) => (m().has(k) ? JSON.parse(JSON.stringify(m().get(k))) : null),
      set: async (k: string, v: unknown) => void m().set(k, v),
      del: async (k: string) => void m().delete(k),
      keys: async () => [...m().keys()],
      wipe: async () => m().clear(),
    },
  };
});

describe('bytes', () => {
  it('round-trips base64, utf8 and hex', () => {
    const b = utf8('héllo 🔥');
    expect(fromUtf8(fromB64(toB64(b)))).toBe('héllo 🔥');
    expect(hex(new Uint8Array([0, 255, 16]))).toBe('00ff10');
    expect(concat(new Uint8Array([1]), new Uint8Array([2, 3]))).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('R-07.3 first message rules', () => {
  const fresh = { theyWrote: false };
  const t = (text: string) => firstMessageProblem(fresh, { t: 'text', text });
  it('blocks links, handles, emails and phone numbers', () => {
    expect(t('see https://x.com')).toBe('first_no_contacts');
    expect(t('my site thirstr.fun')).toBe('first_no_contacts');
    expect(t('add me @jules_92')).toBe('first_no_contacts');
    expect(t('mail a@b.ch')).toBe('first_no_contacts');
    expect(t('call +41 79 123 45 67')).toBe('first_no_contacts');
  });
  it('allows plain text and limits length', () => {
    expect(t('Hey, free tonight?')).toBeNull();
    expect(t('x'.repeat(501))).toBe('first_too_long');
    expect(firstMessageProblem(fresh, { t: 'media', media: { blob: 'b', key: 'k', iv: 'i', mime: 'image/jpeg' } })).toBe('first_text_only');
  });
  it('lifts the rules once the other side replied', () => {
    expect(firstMessageProblem({ theyWrote: true }, { t: 'text', text: 'https://x.com' })).toBeNull();
  });
});

describe('MLS 1:1 on the pure-JS subtle shim (Hermes path)', () => {
  it('creates a group, joins from the welcome, and exchanges messages both ways', async () => {
    const real = globalThis.crypto?.subtle;
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true });
    installSubtle();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mls = require('../src/chat/mls') as typeof import('../src/chat/mls');
      const dev = (d: string) => ((globalThis as { __dev?: string }).__dev = d);
      const alice = { p: 'pa', d: 'da' };
      const bob = { p: 'pb', d: 'db' };
      dev('bob');
      const kp = await mls.newKeyPackage(bob);
      dev('alice');
      const g = await mls.createWith(alice, [{ id: 1, device_id: 'db', key_package: toB64(kp.wire), profile: 'pb' }]);
      dev('bob');
      const j = await mls.join(fromB64(g.envelopes[0].ciphertext));
      expect(j?.groupId).toBe(g.groupId);
      expect(j?.members.map((m) => m.p).sort()).toEqual(['pa', 'pb']);
      dev('alice');
      const a1 = await mls.seal(g.groupId, utf8('hi bob'));
      expect(a1.members).toHaveLength(2);
      dev('bob');
      expect(fromUtf8((await mls.open(g.groupId, a1.wire))!)).toBe('hi bob');
      const b1 = await mls.seal(g.groupId, utf8('hi alice'));
      dev('alice');
      expect(fromUtf8((await mls.open(g.groupId, b1.wire))!)).toBe('hi alice');
      // ciphertext never contains the plaintext
      expect(hex(a1.wire).includes(hex(utf8('hi bob')))).toBe(false);
    } finally {
      Object.defineProperty(globalThis.crypto, 'subtle', { value: real, configurable: true });
    }
  }, 30000);

  it('group: host adds and removes members with commits; welcome carries the chat context', async () => {
    const mls = require('../src/chat/mls') as typeof import('../src/chat/mls');
    const dev = (d: string) => ((globalThis as { __dev?: string }).__dev = d);
    const kpOf = async (name: string) => {
      dev(name);
      const kp = await mls.newKeyPackage({ p: 'p' + name, d: 'd' + name });
      return { id: 1, device_id: 'd' + name, key_package: toB64(kp.wire), profile: 'p' + name };
    };
    const bobKp = await kpOf('bob');
    const carolKp = await kpOf('carol');
    dev('host');
    const g = await mls.createWith({ p: 'phost', d: 'dhost' }, [bobKp], 'party:x');
    dev('bob');
    expect((await mls.join(fromB64(g.envelopes[0].ciphertext)))?.ctx).toBe('party:x');
    dev('host');
    const add = await mls.addMembers(g.groupId, [carolKp], 'party:x');
    dev('bob');
    expect(await mls.open(g.groupId, add.commit)).toBeNull();
    dev('carol');
    const j = await mls.join(fromB64(add.welcomes[0].ciphertext));
    expect(j?.members.map((m) => m.p).sort()).toEqual(['pbob', 'pcarol', 'phost']);
    const m = await mls.seal(g.groupId, utf8('hi all'));
    dev('bob');
    expect(fromUtf8((await mls.open(g.groupId, m.wire))!)).toBe('hi all');
    dev('host');
    expect(fromUtf8((await mls.open(g.groupId, m.wire))!)).toBe('hi all');
    const rm = await mls.removeProfiles(g.groupId, ['pbob']);
    expect(rm?.to.map((x) => x.p).sort()).toEqual(['pcarol', 'phost']);
    dev('carol');
    await mls.open(g.groupId, rm!.commit);
    const m2 = await mls.seal(g.groupId, utf8('bob is out'));
    dev('host');
    expect(fromUtf8((await mls.open(g.groupId, m2.wire))!)).toBe('bob is out');
    dev('bob');
    await expect(mls.open(g.groupId, m2.wire)).rejects.toBeTruthy();
  }, 30000);
});
