import { describe, expect, it, jest } from '@jest/globals';

const mockStore = new Map<string, unknown>();
const mockCalls: string[] = [];
let mockOrphan = false;
jest.mock('../src/chat/kv', () => ({
  kv: {
    get: async (k: string) => mockStore.get(k) ?? null,
    set: async (k: string, v: unknown) => void mockStore.set(k, v),
    del: async (k: string) => void mockStore.delete(k),
    keys: async () => [...mockStore.keys()],
    wipe: async () => mockStore.clear(),
  },
}));
jest.mock('../src/explore/location', () => ({ currentPosition: async () => null }));
jest.mock('../src/api/client', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(mockStatus: number, mockCode: string) {
      super(mockCode);
      this.status = mockStatus;
      this.code = mockCode;
    }
  }
  return {
    ApiError,
    api: async (method: string, path: string) => {
      mockCalls.push(`${method} ${path}`);
      if (path === '/trusted') return { contacts: [{ id: 'r1', accepted: true, push: true }] };
      if (path === '/checkin/current' && method === 'DELETE') mockOrphan = false;
      if (path === '/checkin' && method === 'POST' && mockOrphan) throw new ApiError(409, 'checkin_active');
      if (path === '/checkin' && method === 'POST') return { token: 't1', due_at: new Date(Date.now() + 7200_000).toISOString() };
      return {};
    },
  };
});
jest.mock('../src/chat/engine', () => ({ getConv: () => undefined, messages: async () => [] }));

import { Platform } from 'react-native';
import * as Q from '../src/safety/quick';
import * as S from '../src/safety/safety';

const now = Date.parse('2026-11-21T20:00:00Z');
const line = (text: string, minsAgo = 5) => ({ text, at: now - minsAgo * 60_000 });

describe('#112 meetup prompt matcher (R-13.18, AC-13.6)', () => {
  it.each([
    'On my way, 20 min',
    'omw',
    'see you there',
    'Come over?',
    'be there in 10',
    'I’m outside',
    'j’arrive dans 5 min',
    'je suis devant',
    'Viens chez moi',
    'bin gleich da',
    'Komm vorbei',
    'Langstrasse 120, I’ll be at the bar',
    'Rotbuchstr. 8, 3rd floor',
    '12 rue de Rivoli',
    '221 Baker Street',
  ])('matches "%s"', (t) => expect(Q.hasCue(t)).toBe(true));

  it.each(['hey', 'what are you into?', 'nice pics', 'I have 2 dogs', 'route 66 is a song', 'strasse'])('ignores "%s"', (t) => expect(Q.hasCue(t)).toBe(false));

  it('only looks at the last 6 messages of the last 3 h', () => {
    expect(Q.meetupCue([line('on my way', 200)], now)).toBe(false);
    expect(Q.meetupCue([line('on my way'), ...Array.from({ length: 6 }, () => line('ok'))], now)).toBe(false);
    expect(Q.meetupCue([line('hi'), line('on my way')], now)).toBe(true);
  });

  it('runs without any network call and dismissal stays on the phone for 12 h', async () => {
    mockCalls.length = 0;
    Q.meetupCue([line('come over')], now);
    await Q.dismissCue('c1');
    expect(await Q.cueDismissed('c1')).toBe(true);
    expect(await Q.cueDismissed('c1', Date.now() + Q.DISMISS_MS + 1)).toBe(false);
    expect(mockCalls).toEqual([]);
  });
});

describe('#112 helpers', () => {
  it('time left as h:mm parts, never negative', () => {
    expect(Q.leftParts(new Date(now + 102 * 60_000).toISOString(), now)).toMatchObject({ h: 1, m: 42 });
    expect(Q.leftParts(new Date(now - 60_000).toISOString(), now)).toMatchObject({ h: 0, m: 0, ms: 0 });
  });
  it('names contacts', () => {
    const and = (a: string, b: string) => `${a} and ${b}`;
    expect(Q.whoText([], and, 'your contacts')).toBe('your contacts');
    expect(Q.whoText(['Léa'], and, 'x')).toBe('Léa');
    expect(Q.whoText(['Léa', 'Sam', 'Ana'], and, 'x')).toBe('Léa, Sam and Ana');
  });
});

describe('#112 live state (R-13.16)', () => {
  it('start, live toggle and OK notify subscribers; chat name stays local', async () => {
    // No local notification scheduling in this test (dynamic import of expo-notifications).
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    mockStore.set('safety:contacts', [{ id: 'r1', rid: 'x', key: 'A'.repeat(43), label: 'Léa' }]);
    const seen: (S.Active | null)[] = [];
    const off = S.onActive((a) => seen.push(a));
    const a = await S.startCheckin({ minutes: 120, name: 'Me', live: false, cid: 'c1', peer: 'Marco' });
    expect(a.peer).toBe('Marco');
    expect(a.who).toBeUndefined();
    expect(a.started).toBeTruthy();
    expect((await S.setLive(true))?.live).toBe(true);
    await S.okCheckin();
    off();
    expect(seen.map((x) => (x ? x.live : null))).toEqual([false, true, null]);
  });
});

describe('#127 check-in left on the server by a lost phone copy', () => {
  it('starting a new one ends the orphan and starts', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    mockStore.set('safety:contacts', [{ id: 'r1', rid: 'x', key: 'A'.repeat(43), label: 'Léa' }]);
    mockOrphan = true;
    mockCalls.length = 0;
    const a = await S.startCheckin({ minutes: 60, name: 'Me', live: false });
    expect(a.token).toBe('t1');
    expect(mockCalls.filter((c) => c.includes('/checkin'))).toEqual(['POST /checkin', 'DELETE /checkin/current', 'POST /checkin']);
    await S.okCheckin();
  });

  it('never ends a check-in this phone runs', async () => {
    await S.startCheckin({ minutes: 60, name: 'Me', live: false });
    mockOrphan = true;
    mockCalls.length = 0;
    await expect(S.startCheckin({ minutes: 60, name: 'Me', live: false })).rejects.toMatchObject({ code: 'checkin_active' });
    expect(mockCalls).not.toContain('DELETE /checkin/current');
    mockOrphan = false;
    await S.okCheckin();
  });
});
