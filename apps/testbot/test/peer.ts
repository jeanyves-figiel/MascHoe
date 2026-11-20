// Test peer for e2e.test.ts: a second MLS client (the app's mls.ts) that starts a chat with the
// bot through the mock server, sends the given texts and prints every decrypted payload (JSON lines).
import * as mls from '../../mobile/src/chat/mls';
import { fromB64, fromUtf8, hex, rand, toB64, utf8 } from '../../mobile/src/chat/bytes';

const API = process.env.API_URL!;
const BOT = process.env.BOT_PROFILE!;
const texts = (process.env.TEXTS ?? 'hallo').split('|');
const waitMs = Number(process.env.WAIT_MS ?? 12_000);
const ME = 'PEER';

const api = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(API + '/v1' + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer peer' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}`);
  return r.json();
};
const out = (x: unknown) => console.log(JSON.stringify(x));

const { device_id: dev } = await api('GET', '/mls/keypackages');
const claimed = await api('POST', '/mls/keypackages/claim', { from_profile_id: ME, to_profile_id: BOT });
const g = await mls.createWith({ p: ME, d: dev }, claimed.key_packages.map((k: object) => ({ ...k, profile: BOT })));
await api('POST', '/mls/messages', { from_profile_id: ME, group_id: toB64(g.gid), envelopes: g.envelopes });

for (const text of texts) {
  const plain = utf8(JSON.stringify({ t: 'text', text, v: 1, id: hex(rand(12)), at: Date.now(), fk: toB64(rand(32)) }));
  const s = await mls.seal(g.groupId, plain);
  const to = s.members.filter((m) => m.p !== ME);
  await api('POST', '/mls/messages', { from_profile_id: ME, group_id: toB64(g.gid), envelopes: to.map((m) => ({ to_profile_id: m.p, to_device_id: m.d, kind: 'app', ciphertext: toB64(s.wire) })) });
  out({ sent: text });
  const until = Date.now() + waitMs;
  let gotText = false;
  while (Date.now() < until && !gotText) {
    const r = await api('GET', '/mls/messages');
    for (const m of r.messages) {
      const pt = await mls.open(hex(fromB64(m.group_id)), fromB64(m.ciphertext));
      if (!pt) continue;
      const p = JSON.parse(fromUtf8(pt));
      out({ got: p.t, text: p.text, k: p.k });
      if (p.t === 'text' || p.t === 'quick_reply') gotText = true;
    }
    if (r.messages.length) await api('POST', '/mls/messages/ack', { ids: r.messages.map((m: { id: number }) => m.id) });
    await new Promise((res) => setTimeout(res, 300));
  }
}
process.exit(0);
