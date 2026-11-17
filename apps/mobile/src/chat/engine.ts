// Chat engine (F-07): conversations on the device, MLS via mls.ts, delivery via the API.
// The server sees ciphertext, profile ids and device ids only (AC-07.1).
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Socket } from 'phoenix';
import { AppState, Platform } from 'react-native';
import { accessToken, api, API_BASE, ApiError, Me } from '../api/client';
import type { ProfileView } from '../api/types';
import { fromB64, fromUtf8, hex, rand, toB64, utf8 } from './bytes';
import { kv } from './kv';
import * as mls from './mls';
import { getLocal } from '../me/localFields';

export type Ttl = '24h' | '7d' | 'never';
export const TTL_S: Record<Ttl, number | null> = { '24h': 86400, '7d': 7 * 86400, never: null };

export type MediaRef = { blob: string; key: string; iv: string; mime: string; w?: number; h?: number; once?: boolean; exp?: number; save?: boolean };
export type AlbumItem = { blob: string; key: string; iv: string; mime: string };

/** Plaintext inside MLS application messages (R-07.4). */
export type Payload =
  | { t: 'text'; text: string }
  | { t: 'quick_reply'; text: string }
  | { t: 'media'; media: MediaRef }
  | { t: 'read'; upTo: string }
  | { t: 'disappearing'; ttl: Ttl }
  | { t: 'reaction'; to: string; emoji: string }
  | { t: 'album.grant'; album: string; name: string; items: AlbumItem[]; until?: number }
  | { t: 'album.revoke'; album: string }
  | { t: 'profile.private'; fields: Record<string, unknown> }
  | { t: 'location.share'; lat: number; lng: number; until: number }
  | { t: 'screenshot' };

export type Msg = {
  id: string;
  from: 'me' | 'them';
  at: number;
  p: Payload;
  status?: 'sending' | 'sent' | 'failed' | 'read';
  readAt?: number;
  opened?: boolean;
  fk?: string;
};

export type Conv = {
  id: string;
  me: string;
  peer: string;
  groups: string[];
  name: string;
  age?: number;
  photo: string | null;
  verified: boolean;
  lastAt: number;
  last: string;
  unread: number;
  theyWrote: boolean;
  iWrote: boolean;
  starred?: boolean;
  muted?: boolean;
  archived?: boolean;
  ttl: Ttl;
  gone?: boolean;
  peerFields?: Record<string, unknown>;
  privSent?: string;
};

type Wire = Payload & { v: 1; id: string; at: number; fk: string };

// ------------------------------------------------------------------ tiny event bus

type Fn = () => void;
const subs = new Map<string, Set<Fn>>();
export function on(topic: string, fn: Fn) {
  if (!subs.has(topic)) subs.set(topic, new Set());
  subs.get(topic)!.add(fn);
  return () => {
    subs.get(topic)!.delete(fn);
  };
}
const emit = (topic: string) => subs.get(topic)?.forEach((f) => f());

// ------------------------------------------------------------------ state

let me: Me | null = null;
let device: string | null = null;
let convs: Record<string, Conv> = {};
const typing: Record<string, number> = {};
let socket: Socket | null = null;
let pulling: Promise<void> | null = null;
let again = false;

const convId = (mine: string, peer: string) => `${mine}:${peer}`;
const saveConvs = () => kv.set('convs', convs).then(() => emit('convs'));
export const getConvs = () => Object.values(convs).sort((a, b) => b.lastAt - a.lastAt);
export const getConv = (id: string) => convs[id];
export const isTyping = (id: string) => (typing[id] ?? 0) > Date.now() - 6000;
export const unreadTotal = () => Object.values(convs).reduce((n, c) => n + (c.archived || c.muted ? 0 : c.unread > 0 ? 1 : 0), 0);

export async function messages(id: string): Promise<Msg[]> {
  return (await kv.get<Msg[]>('msgs:' + id)) ?? [];
}

async function putMessages(id: string, list: Msg[]) {
  await kv.set('msgs:' + id, list.slice(-500));
  emit('msgs:' + id);
}

// ------------------------------------------------------------------ lifecycle

/** Starts the engine for the signed-in account: key packages, realtime, first pull. */
export async function start(account: Me) {
  me = account;
  convs = (await kv.get<Record<string, Conv>>('convs')) ?? {};
  emit('convs');
  await ensureKeyPackages().catch(() => {});
  connect();
  registerPush().catch(() => {});
  pull();
  sweepTimer ??= setInterval(sweepExpired, 60_000);
  sweepExpired();
  appSub ??= AppState.addEventListener('change', (s) => s === 'active' && pull());
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let appSub: { remove: () => void } | null = null;

export function stop() {
  socket?.disconnect();
  socket = null;
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
  appSub?.remove();
  appSub = null;
  me = null;
}

/** Sign-out / account delete: wipe everything on the device (data-model.md › Device-only). */
export async function wipe() {
  stop();
  convs = {};
  await kv.wipe();
  emit('convs');
}

const KP_TARGET = 30;
const KP_MIN = 15;

async function ensureKeyPackages() {
  if (!me) return;
  const r = await api<{ counts: Record<string, { count: number; last_resort: boolean }>; device_id: string }>('GET', '/mls/keypackages');
  if (!r.device_id) throw new Error('no device id');
  device = r.device_id;
  for (const [profile, c] of Object.entries(r.counts)) {
    if (c.count >= KP_MIN && c.last_resort) continue;
    const m = { p: profile, d: device };
    const fresh = [];
    for (let i = c.count; i < KP_TARGET; i++) fresh.push(toB64((await mls.newKeyPackage(m)).wire));
    let lastResort: string | undefined;
    if (!c.last_resort) {
      const lr = await mls.newKeyPackage(m);
      await kv.set('kp:lastresort:' + profile, lr.ref);
      lastResort = toB64(lr.wire);
    }
    await api('POST', '/mls/keypackages', { profile_id: profile, key_packages: fresh, last_resort: lastResort });
  }
}

function connect() {
  if (socket) return;
  const url = API_BASE.replace(/^http/, 'ws').replace(/\/v1$/, '') + '/socket';
  let token: string | null = null;
  const s = new Socket(url.startsWith('/') ? `${location.origin.replace(/^http/, 'ws')}${url}` : url, { params: () => ({ token }) });
  const refresh = async () => {
    await api('GET', '/mls/keypackages').catch(() => {});
    token = await accessToken();
  };
  s.onError(() => {
    refresh();
  });
  refresh().then(() => {
    s.connect();
    const ch = s.channel('user:me', {});
    ch.on('message.new', () => pull());
    ch.on('typing', (p: { from_profile_id: string; to_profile_id: string }) => {
      const id = convId(p.to_profile_id, p.from_profile_id);
      typing[id] = Date.now();
      emit('typing:' + id);
    });
    ch.on('tap.new', () => emit('taps'));
    ch.on('tap.mutual', () => emit('taps'));
    ch.join().receive('ok', () => pull());
    chan = ch;
  });
  socket = s;
}

let chan: ReturnType<Socket['channel']> | null = null;

async function registerPush() {
  if (Platform.OS !== 'ios') return;
  const N = await import('expo-notifications');
  const perm = await N.getPermissionsAsync();
  if (perm.status !== 'granted') return;
  const t = await N.getDevicePushTokenAsync();
  await api('PUT', '/me/push', { token: t.data, platform: 'ios' });
}

/** R-16.7: ask on first inbound event, after the app's own explanation. */
export async function askPushPermission() {
  if (Platform.OS !== 'ios') return false;
  const N = await import('expo-notifications');
  const r = await N.requestPermissionsAsync();
  if (r.status === 'granted') await registerPush().catch(() => {});
  return r.status === 'granted';
}

// ------------------------------------------------------------------ receive

type Incoming = { id: number; to_profile_id: string; from_profile_id: string; group_id: string; kind: string; ciphertext: string; at: string };

export function pull(): Promise<void> {
  if (pulling) {
    again = true;
    return pulling;
  }
  pulling = (async () => {
    try {
      do {
        again = false;
        const r = await api<{ messages: Incoming[] }>('GET', '/mls/messages');
        if (!r.messages.length) break;
        const done: number[] = [];
        for (const m of r.messages) {
          try {
            await handle(m);
          } catch {
            // undecryptable: drop it (ack) rather than loop forever
          }
          done.push(m.id);
        }
        await api('POST', '/mls/messages/ack', { ids: done });
        if (r.messages.length === 200) again = true;
      } while (again);
    } catch {
      // offline: next socket event / foreground retries
    } finally {
      pulling = null;
    }
  })();
  return pulling;
}

async function handle(m: Incoming) {
  const wire = fromB64(m.ciphertext);
  const gid = hex(fromB64(m.group_id));
  if (m.kind === 'welcome') {
    const j = await mls.join(wire);
    if (!j) return;
    const c = await ensureConv(m.to_profile_id, m.from_profile_id);
    // Both sides may create a group at once: keep both, send on the lowest id (deterministic).
    if (!c.groups.includes(j.groupId)) c.groups = [...c.groups, j.groupId].sort();
    await kv.set('g2c:' + j.groupId, c.id);
    await saveConvs();
    return;
  }
  if (m.kind !== 'app') return;
  const plain = await mls.open(gid, wire);
  if (!plain) return;
  const w = JSON.parse(fromUtf8(plain)) as Wire;
  const cid = (await kv.get<string>('g2c:' + gid)) ?? convId(m.to_profile_id, m.from_profile_id);
  if (!convs[cid]) await ensureConv(m.to_profile_id, m.from_profile_id);
  await receive(cid, w, Date.parse(m.at) || w.at);
}

async function receive(cid: string, w: Wire, at: number) {
  const c = convs[cid];
  if (!c) return;
  const list = await messages(cid);
  const p = stripWire(w);
  switch (p.t) {
    case 'read': {
      const idx = list.findIndex((x) => x.id === p.upTo);
      for (let i = 0; i <= idx; i++) if (list[i].from === 'me') list[i] = { ...list[i], status: 'read', readAt: list[i].readAt ?? Date.now() };
      await putMessages(cid, list);
      return;
    }
    case 'disappearing':
      c.ttl = p.ttl;
      break;
    case 'album.grant':
      await kv.set(`grant:${c.id}:${p.album}`, p);
      break;
    case 'album.revoke':
      await kv.del(`grant:${c.id}:${p.album}`);
      break;
    case 'profile.private':
      c.peerFields = p.fields;
      break;
  }
  if (list.some((x) => x.id === w.id)) return;
  list.push({ id: w.id, from: 'them', at, p, fk: w.fk });
  c.theyWrote = true;
  if (p.t !== 'reaction') {
    c.lastAt = at;
    c.last = preview(p);
    c.unread += 1;
    c.archived = false;
  }
  delete typing[cid];
  await putMessages(cid, list);
  await saveConvs();
  emit('incoming');
}

const stripWire = (w: Wire): Payload => {
  const { v: _v, id: _id, at: _at, fk: _fk, ...p } = w;
  return p as Payload;
};

export function preview(p: Payload): string {
  switch (p.t) {
    case 'text':
    case 'quick_reply':
      return p.text;
    case 'media':
      return '📷';
    case 'album.grant':
      return '🔓 ' + p.name;
    case 'album.revoke':
      return '🔒';
    case 'location.share':
      return '📍';
    case 'disappearing':
      return '⏱';
    default:
      return '';
  }
}

// ------------------------------------------------------------------ conversations

async function ensureConv(mine: string, peer: string): Promise<Conv> {
  const id = convId(mine, peer);
  if (convs[id]) return convs[id];
  const c: Conv = { id, me: mine, peer, groups: [], name: '…', photo: null, verified: false, lastAt: Date.now(), last: '', unread: 0, theyWrote: false, iWrote: false, ttl: (me?.settings?.disappearing_default as Ttl) ?? '7d' };
  convs[id] = c;
  refreshPeer(c).catch(() => {});
  return c;
}

/** Peer name/photo for the inbox (fetched like any profile view; never stored server-side). */
export async function refreshPeer(c: Conv) {
  try {
    const v = await api<ProfileView>('GET', `/profiles/${c.peer}`);
    Object.assign(c, { name: v.display_name, age: v.age, photo: v.photos[0] ?? null, verified: v.verified, gone: false });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) c.gone = true;
  }
  await saveConvs();
}

/** Opens (or prepares) the conversation between one of my profiles and a peer profile. */
export async function openConv(mine: string, peer: string, hint?: Partial<Conv>): Promise<Conv> {
  const c = await ensureConv(mine, peer);
  if (hint) Object.assign(c, Object.fromEntries(Object.entries(hint).filter(([, v]) => v !== undefined)));
  await saveConvs();
  return c;
}

export async function setConv(id: string, patch: Partial<Pick<Conv, 'starred' | 'muted' | 'archived'>>) {
  if (!convs[id]) return;
  Object.assign(convs[id], patch);
  await saveConvs();
}

/** Delete locally (R-07.8): messages, group state and the inbox row. */
export async function deleteConv(id: string) {
  const c = convs[id];
  if (!c) return;
  for (const g of c.groups) {
    await mls.forget(g);
    await kv.del('g2c:' + g);
  }
  await kv.del('msgs:' + id);
  delete convs[id];
  await saveConvs();
}

// ------------------------------------------------------------------ send

export { firstMessageProblem } from './rules';

async function ensureGroup(c: Conv): Promise<string> {
  if (c.groups.length) return c.groups[0];
  const claimed = await api<{ key_packages: { id: number; device_id: string; key_package: string }[] }>('POST', '/mls/keypackages/claim', {
    from_profile_id: c.me,
    to_profile_id: c.peer,
  });
  if (!device) await ensureKeyPackages();
  const g = await mls.createWith(
    { p: c.me, d: device! },
    claimed.key_packages.map((k) => ({ ...k, profile: c.peer })),
  );
  await api('POST', '/mls/messages', { from_profile_id: c.me, group_id: toB64(g.gid), envelopes: g.envelopes });
  c.groups = [g.groupId, ...c.groups].sort();
  await kv.set('g2c:' + g.groupId, c.id);
  await saveConvs();
  return c.groups[0];
}

/** Sends a payload. Visible payloads are added to the thread optimistically (R-07.14). */
export async function send(cid: string, p: Payload, opts: { silent?: boolean } = {}): Promise<Msg | null> {
  const c = convs[cid];
  if (!c) throw new Error('no conversation');
  const id = hex(rand(12));
  const at = Date.now();
  const fk = rand(32);
  const body: Wire = { ...(p as object), v: 1, id, at, fk: toB64(fk) } as Wire;
  const plain = utf8(JSON.stringify(body));
  // R-07.11 franking: commitment over the plaintext, opened only if the recipient reports.
  const tag = hmac(sha256, fk, plain);
  let msg: Msg | null = null;
  if (!opts.silent) {
    msg = { id, from: 'me', at, p, status: 'sending', fk: toB64(fk) };
    const list = await messages(cid);
    list.push(msg);
    await putMessages(cid, list);
    c.lastAt = at;
    c.last = preview(p);
    c.iWrote = true;
    if (p.t === 'disappearing') c.ttl = p.ttl;
    await saveConvs();
  }
  try {
    const gid = await ensureGroup(c);
    const sealed = await mls.seal(gid, plain);
    const envelopes = sealed.members
      .filter((m) => !(m.p === c.me && m.d === device))
      .map((m) => ({ to_profile_id: m.p, to_device_id: m.d, kind: 'app', ciphertext: toB64(sealed.wire) }));
    const r = await api<{ delivered: string[]; undelivered: string[] }>('POST', '/mls/messages', {
      from_profile_id: c.me,
      group_id: toB64(fromHex(gid)),
      franking_tag: toB64(tag),
      envelopes,
    });
    if (msg) await setStatus(cid, id, r.undelivered.length ? 'failed' : 'sent');
    if (p.t !== 'profile.private' && p.t !== 'read') sharePrivate(c).catch(() => {});
  } catch (e) {
    if (msg) await setStatus(cid, id, 'failed');
    throw e;
  }
  return msg;
}

const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

async function setStatus(cid: string, id: string, status: Msg['status']) {
  const list = await messages(cid);
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0 && list[i].status !== 'read') list[i] = { ...list[i], status };
  await putMessages(cid, list);
}

export async function retry(cid: string, id: string) {
  const list = await messages(cid);
  const m = list.find((x) => x.id === id);
  if (!m) return;
  await putMessages(
    cid,
    list.filter((x) => x.id !== id),
  );
  await send(cid, m.p);
}

/** Opening a thread: clear unread; send a read receipt if both sides allow (R-07.7). */
export async function markRead(cid: string) {
  const c = convs[cid];
  if (!c) return;
  const list = await messages(cid);
  const now = Date.now();
  let lastTheirs: Msg | null = null;
  const next = list.map((m) => {
    if (m.from === 'them') {
      lastTheirs = m;
      return m.readAt ? m : { ...m, readAt: now };
    }
    return m;
  });
  await putMessages(cid, next);
  if (c.unread) {
    c.unread = 0;
    await saveConvs();
  }
  const last = lastTheirs as Msg | null;
  if (last && me?.settings?.read_receipts !== false && !(await kv.get<boolean>('read:' + last.id))) {
    await kv.set('read:' + last.id, true);
    send(cid, { t: 'read', upTo: last.id }, { silent: true }).catch(() => {});
  }
}

let lastTyping = 0;
export function sendTyping(cid: string) {
  const c = convs[cid];
  if (!c || !chan || me?.settings?.read_receipts === false || Date.now() - lastTyping < 3000) return;
  lastTyping = Date.now();
  chan.push('typing', { from_profile_id: c.me, to_profile_id: c.peer });
}

// ------------------------------------------------------------------ disappearing (R-07.6)

export function expiresAt(c: Conv, m: Msg): number | null {
  const ttl = TTL_S[c.ttl];
  if (!ttl || m.p.t === 'disappearing') return null;
  const start = m.readAt ?? (m.from === 'me' ? m.at : null);
  return start ? start + ttl * 1000 : null;
}

async function sweepExpired() {
  const now = Date.now();
  for (const c of Object.values(convs)) {
    if (!TTL_S[c.ttl]) continue;
    const list = await messages(c.id);
    const keep = list.filter((m) => {
      const e = expiresAt(c, m);
      return !e || e > now;
    });
    if (keep.length !== list.length) await putMessages(c.id, keep);
  }
}

// ------------------------------------------------------------------ local wipe of one message (view-once)

export async function markOpened(cid: string, id: string) {
  const list = await messages(cid);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], opened: true };
  await putMessages(cid, list);
}

/** Delete one message on this device only (S-41 long-press › Delete for me). */
export async function deleteMessage(cid: string, id: string) {
  await putMessages(
    cid,
    (await messages(cid)).filter((x) => x.id !== id && !(x.p.t === 'reaction' && x.p.to === id)),
  );
}

// R-06.6: fields set to "My chats" are sent E2EE to chat partners when a chat starts or they change.
async function chatFields(profileId: string): Promise<Record<string, unknown>> {
  const vis = (me?.profiles ?? []).find((x) => x.id === profileId)?.visibility_map ?? {};
  const local = await getLocal(profileId);
  return Object.fromEntries(Object.entries(local).filter(([k, v]) => vis[k] === 'chats' && v !== null && v !== '' && v !== undefined));
}

async function sharePrivate(c: Conv) {
  const fields = await chatFields(c.me);
  const sig = hex(sha256(utf8(JSON.stringify(fields))));
  if (c.privSent === sig || (!Object.keys(fields).length && !c.privSent)) return;
  c.privSent = sig;
  await saveConvs();
  await send(c.id, { t: 'profile.private', fields }, { silent: true });
}

/** After editing "My chats" fields: resend to every conversation of that profile. */
export async function resharePrivate(profileId: string) {
  for (const c of Object.values(convs)) if (c.me === profileId && c.groups.length && !c.gone) await sharePrivate(c).catch(() => {});
}

/** Keeps settings (read receipts, disappearing default) in sync with the session. */
export const updateMe = (m: Me) => {
  if (me) me = m;
};

export const currentDevice = () => device;
export const currentMe = () => me;
