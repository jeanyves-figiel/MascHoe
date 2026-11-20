// Thirstr chat test bot (testing.md › Chat test bot, #109). Staging only.
// A real chat client: own MLS keys (the app's mls.ts, bundled), key packages on the server,
// ciphertext only on the wire. Auto-replies, sends Delivered/Read receipts and typing.
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Socket } from 'phoenix';
import * as mls from '../../mobile/src/chat/mls';
import { fromB64, fromUtf8, hex, rand, toB64, utf8 } from '../../mobile/src/chat/bytes';
import { kv } from './kv';
import { initialState, nonText, plan, type ChatState, type Out } from './replies';

const API = (process.env.API_URL ?? 'https://staging.thirstr.fun').replace(/\/$/, '');
const KEY = process.env.TESTBOT_KEY ?? '';
const POLL_MS = Number(process.env.BOT_POLL_MS ?? 20_000);
const KP_TARGET = 30;
const KP_MIN = 15;
const STUCK_MS = 10 * 60_000;

type Auth = { access: string; refresh: string; profile: string };
type Conv = { gids: string[]; s: ChatState };
type Incoming = { id: number; to_profile_id: string; from_profile_id: string; group_id: string; kind: string; ciphertext: string; at: string };

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

// ------------------------------------------------------------------ one lock for all MLS state

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const r = chain.then(fn, fn);
  chain = r.catch(() => {});
  return r;
}

// ------------------------------------------------------------------ API

let auth: Auth | null = null;
let device = '';

class HttpError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`HTTP ${status} ${body.slice(0, 200)}`);
  }
}

async function http(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(API + '/v1' + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-thirstr-install': 'testbot-0000000000000000', 'x-thirstr-platform': 'web', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, text);
  return text ? JSON.parse(text) : undefined;
}

/** New session from the server (wipes local MLS state: old device and its keys are gone). */
async function newSession() {
  if (!KEY) throw new Error('TESTBOT_KEY missing');
  const s = await http('POST', '/testbot/session', {}, { 'x-testbot-key': KEY });
  await kv.wipe();
  auth = { access: s.access_token, refresh: s.refresh_token, profile: s.profile_id };
  await kv.set('auth', auth);
  log('new session, profile', auth.profile);
}

async function refresh() {
  try {
    const s = await http('POST', '/auth/refresh', { refresh: auth!.refresh });
    auth = { ...auth!, access: s.access_token, refresh: s.refresh_token };
    await kv.set('auth', auth);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) await newSession();
    else throw e;
  }
}

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await http(method, path, body, { authorization: 'Bearer ' + auth!.access });
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 401) throw e;
    await refresh();
    return http(method, path, body, { authorization: 'Bearer ' + auth!.access });
  }
}

// ------------------------------------------------------------------ keys

async function ensureKeyPackages() {
  const r = await api<{ counts: Record<string, { count: number; last_resort: boolean }>; device_id: string }>('GET', '/mls/keypackages');
  device = r.device_id;
  const counts = r.counts[auth!.profile] ?? { count: 0, last_resort: false };
  if (counts.count >= KP_MIN && counts.last_resort) return;
  const me = { p: auth!.profile, d: device };
  const fresh: string[] = [];
  for (let i = counts.count; i < KP_TARGET; i++) fresh.push(toB64((await mls.newKeyPackage(me)).wire));
  let lastResort: string | undefined;
  if (!counts.last_resort) {
    const lr = await mls.newKeyPackage(me);
    await kv.set('kp:lastresort:' + auth!.profile, lr.ref);
    lastResort = toB64(lr.wire);
  }
  await api('POST', '/mls/keypackages', { profile_id: auth!.profile, key_packages: fresh, last_resort: lastResort });
  log('key packages topped up', fresh.length);
}

// ------------------------------------------------------------------ conversations

const getConv = async (peer: string): Promise<Conv> => (await kv.get<Conv>('conv:' + peer)) ?? { gids: [], s: initialState() };
const putConv = (peer: string, c: Conv) => kv.set('conv:' + peer, c);

async function ensureGroup(peer: string): Promise<string> {
  const c = await getConv(peer);
  for (const g of c.gids) if (await mls.load(g)) return g;
  const claimed = await api<{ key_packages: { id: number; device_id: string; key_package: string }[] }>('POST', '/mls/keypackages/claim', {
    from_profile_id: auth!.profile,
    to_profile_id: peer,
  });
  const g = await mls.createWith(
    { p: auth!.profile, d: device },
    claimed.key_packages.map((k) => ({ ...k, profile: peer })),
  );
  await api('POST', '/mls/messages', { from_profile_id: auth!.profile, group_id: toB64(g.gid), envelopes: g.envelopes });
  c.gids = [g.groupId, ...c.gids].sort();
  await kv.set('g2p:' + g.groupId, peer);
  await putConv(peer, c);
  return c.gids[0];
}

type Payload = Out['p'] | { t: 'read' | 'delivered'; upTo: string } | { t: 'resync'; drop: string };

/** Seals and sends one payload; retries the same ciphertext on network errors (R-07.18). */
function send(peer: string, p: Payload) {
  return locked(async () => {
    const id = hex(rand(12));
    const fk = rand(32);
    const plain = utf8(JSON.stringify({ ...p, v: 1, id, at: Date.now(), fk: toB64(fk) }));
    const tag = hmac(sha256, fk, plain);
    const gid = await ensureGroup(peer);
    const sealed = await mls.seal(gid, plain);
    const to = sealed.members.filter((m) => !(m.p === auth!.profile && m.d === device));
    const body = {
      client_id: id,
      from_profile_id: auth!.profile,
      group_id: toB64(fromHex(gid)),
      franking_tag: toB64(tag),
      envelopes: to.map((m) => ({ to_profile_id: m.p, to_device_id: m.d, kind: 'app', ciphertext: toB64(sealed.wire) })),
    };
    for (let i = 0; ; i++) {
      try {
        if (to.length) await api('POST', '/mls/messages', body);
        return id;
      } catch (e) {
        if (i >= 4 || (e instanceof HttpError && e.status < 500 && e.status !== 429)) throw e;
        await sleep(1000 * 2 ** i);
      }
    }
  });
}

// ------------------------------------------------------------------ receive

let pulling = false;
let again = false;

async function pull() {
  if (pulling) {
    again = true;
    return;
  }
  pulling = true;
  try {
    do {
      again = false;
      const r = await api<{ messages: Incoming[] }>('GET', '/mls/messages');
      if (!r.messages.length) break;
      const seen = new Set((await kv.get<number[]>('seen')) ?? []);
      for (const m of r.messages) {
        if (seen.has(m.id)) continue;
        const res = await locked(() => handle(m));
        if (res === 'pending') await addPending(m);
        seen.add(m.id);
        await kv.set('seen', [...seen].slice(-2000));
      }
      await api('POST', '/mls/messages/ack', { ids: r.messages.map((m) => m.id) });
      if (r.messages.length === 200) again = true;
    } while (again);
    await retryPending();
  } catch (e) {
    log('pull failed', (e as Error).message);
  } finally {
    pulling = false;
  }
}

type Pending = { m: Incoming; first: number };

async function addPending(m: Incoming) {
  const list = (await kv.get<Pending[]>('pending')) ?? [];
  if (!list.some((x) => x.m.id === m.id)) list.push({ m, first: Date.now() });
  await kv.set('pending', list.slice(-200));
}

async function retryPending() {
  const list = (await kv.get<Pending[]>('pending')) ?? [];
  if (!list.length) return;
  const keep: Pending[] = [];
  for (const x of list.sort((a, b) => a.m.id - b.m.id)) {
    const res = await locked(() => handle(x.m));
    if (res !== 'pending') continue;
    if (Date.now() - x.first < STUCK_MS) keep.push(x);
    else if (x.m.kind === 'app') {
      // R-07.20: give up on the broken group, start a fresh one and tell the app to drop it.
      const bad = hex(fromB64(x.m.group_id));
      const peer = x.m.from_profile_id;
      log('resync with', peer);
      await locked(() => dropGroup(peer, bad));
      await send(peer, { t: 'resync', drop: bad }).catch(() => {});
    }
  }
  await kv.set('pending', keep);
}

async function dropGroup(peer: string, gid: string) {
  if (!/^[0-9a-f]+$/.test(gid)) return;
  const c = await getConv(peer);
  await mls.forget(gid);
  await kv.del('g2p:' + gid);
  c.gids = c.gids.filter((g) => g !== gid);
  await putConv(peer, c);
}

/** Returns 'pending' when it can't be opened yet. */
async function handle(m: Incoming): Promise<'pending' | null> {
  const wire = fromB64(m.ciphertext);
  const gid = hex(fromB64(m.group_id));
  if (m.kind === 'welcome') {
    const j = await mls.join(wire).catch(() => null);
    if (!j || j.ctx) return null; // group chats (parties…) are out of scope for the bot
    const peer = j.members.find((x) => x.p !== auth!.profile)?.p ?? m.from_profile_id;
    const c = await getConv(peer);
    if (!c.gids.includes(j.groupId)) c.gids = [...c.gids, j.groupId].sort();
    await kv.set('g2p:' + j.groupId, peer);
    await putConv(peer, c);
    log('joined chat with', peer);
    return null;
  }
  if (m.kind !== 'app' && m.kind !== 'commit') return null;
  let plain: Uint8Array | null;
  try {
    plain = await mls.open(gid, wire);
  } catch {
    return 'pending';
  }
  if (!plain || m.kind !== 'app') return null;
  const w = JSON.parse(fromUtf8(plain)) as { t: string; id: string; text?: string; drop?: string };
  const peer = (await kv.get<string>('g2p:' + gid)) ?? m.from_profile_id;
  if (w.t === 'resync' && w.drop) {
    await dropGroup(peer, w.drop);
    return null;
  }
  if (['read', 'delivered', 'reaction', 'profile.private', 'disappearing', 'screenshot', 'album.revoke', 'notice'].includes(w.t)) return null;
  // Answer outside the lock (replies are sent later, each one through the lock).
  setImmediate(() => respond(peer, w).catch((e) => log('respond failed', (e as Error).message)));
  return null;
}

const busy = new Map<string, Promise<void>>();

/** Receipts, typing and the planned replies, one chat at a time. */
function respond(peer: string, w: { t: string; id: string; text?: string }) {
  const prev = busy.get(peer) ?? Promise.resolve();
  const next = prev.then(async () => {
    const c = await getConv(peer);
    if (c.s.delivered) await send(peer, { t: 'delivered', upTo: w.id }).catch(() => {});
    await sleep(900);
    if (c.s.read) await send(peer, { t: 'read', upTo: w.id }).catch(() => {});
    let out: Out[];
    if (w.t === 'text' || w.t === 'quick_reply') {
      const r = plan(w.text ?? '', c.s);
      c.s = r.state;
      await putConv(peer, c);
      out = r.out;
    } else out = [{ delayMs: 1500, p: { t: 'text', text: nonText(c.s) } }];
    log('reply to', peer, out.length);
    const start = Date.now();
    for (const o of out.sort((a, b) => a.delayMs - b.delayMs)) {
      const wait = start + o.delayMs - Date.now();
      if (wait > 1500) {
        await sleep(wait - 1500);
        typing(peer);
        await sleep(1500);
      } else if (wait > 0) {
        typing(peer);
        await sleep(wait);
      }
      await send(peer, o.p);
    }
  });
  const tail = next.catch(() => {});
  busy.set(peer, tail);
  return next;
}

// ------------------------------------------------------------------ realtime

let chan: ReturnType<Socket['channel']> | null = null;

function typing(peer: string) {
  chan?.push('typing', { from_profile_id: auth!.profile, to_profile_id: peer });
}

function connect() {
  const url = API.replace(/^http/, 'ws') + '/socket';
  const s = new Socket(url, { transport: globalThis.WebSocket, params: () => ({ token: auth!.access }), reconnectAfterMs: (n: number) => Math.min(30_000, 1000 * n) });
  s.onError(() => {
    // expired access token is the usual cause: refresh through any API call
    api('GET', '/mls/keypackages').catch(() => {});
  });
  s.connect();
  const ch = s.channel('user:me', {});
  ch.on('message.new', () => void pull());
  ch.join().receive('ok', () => {
    log('realtime connected');
    void pull();
  });
  chan = ch;
}

// ------------------------------------------------------------------ main

async function main() {
  auth = await kv.get<Auth>('auth');
  if (!auth) await newSession();
  await ensureKeyPackages();
  connect();
  await pull();
  // Backup in case realtime drops; keeps key packages topped up and the access token fresh.
  setInterval(() => {
    void pull();
  }, POLL_MS);
  setInterval(
    () => {
      ensureKeyPackages().catch((e) => log('key packages failed', (e as Error).message));
    },
    10 * 60_000,
  );
  // Now status renewed (location needs no refresh: the server keeps the bot's cell, testing.md).
  setInterval(
    () => {
      setNow().catch(() => {});
    },
    5 * 3600_000,
  );
  await setNow().catch(() => {});
  log('test bot up as', auth!.profile, 'on', API);
}

/** A Now status so the bot stands out on Explore (6 h, renewed). */
async function setNow() {
  await api('PUT', '/me/now', { status: 'now', text: 'Test bot · write help', ttl_s: 21_600 });
}

main().catch((e) => {
  log('fatal', e);
  process.exit(1);
});
