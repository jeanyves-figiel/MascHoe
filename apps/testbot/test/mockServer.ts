// Minimal stand-in for the Thirstr delivery service (server/lib/thirstr/chat.ex) for e2e.test.ts:
// key packages, claim, per-device ciphertext queues, ack. Ciphertext is opaque here too.
import http from 'node:http';

type Kp = { id: number; device: string; kp: string; lr: boolean };
type Msg = { id: number; to_profile_id: string; from_profile_id: string; group_id: string; kind: string; ciphertext: string; at: string };

export function start(key: string) {
  const users: Record<string, { profile: string; device: string }> = {
    bot: { profile: 'BOT', device: 'D-BOT' },
    peer: { profile: 'PEER', device: 'D-PEER' },
  };
  const kps: Record<string, Kp[]> = {};
  const queues: Record<string, Msg[]> = {};
  let seq = 1;
  const log: string[] = [];

  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const send = (code: number, x: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(x));
    };
    const route = `${req.method} ${req.url!.split('?')[0]}`;
    log.push(route);
    if (route === 'POST /v1/testbot/session')
      return req.headers['x-testbot-key'] === key ? send(200, { access_token: 'bot', refresh_token: 'r', expires_in: 900, profile_id: 'BOT' }) : send(404, {});
    const u = users[(req.headers.authorization ?? '').replace('Bearer ', '')];
    if (!u) return send(401, {});
    switch (route) {
      case 'GET /v1/mls/keypackages': {
        const l = kps[u.profile] ?? [];
        return send(200, { device_id: u.device, counts: { [u.profile]: { count: l.filter((k) => !k.lr).length, last_resort: l.some((k) => k.lr) } } });
      }
      case 'POST /v1/mls/keypackages': {
        const l = (kps[body.profile_id] ??= []);
        for (const kp of body.key_packages) l.push({ id: seq++, device: u.device, kp, lr: false });
        if (body.last_resort) l.push({ id: seq++, device: u.device, kp: body.last_resort, lr: true });
        return send(200, {});
      }
      case 'POST /v1/mls/keypackages/claim': {
        const l = kps[body.to_profile_id] ?? [];
        const i = l.findIndex((k) => !k.lr) >= 0 ? l.findIndex((k) => !k.lr) : l.findIndex((k) => k.lr);
        if (i < 0) return send(422, {});
        const k = l[i];
        if (!k.lr) l.splice(i, 1);
        return send(200, { key_packages: [{ id: k.id, device_id: k.device, key_package: k.kp }] });
      }
      case 'POST /v1/mls/messages': {
        for (const e of body.envelopes) {
          const dev = Object.values(users).find((x) => x.device === e.to_device_id)!.device;
          (queues[dev] ??= []).push({ id: seq++, to_profile_id: e.to_profile_id, from_profile_id: body.from_profile_id, group_id: body.group_id, kind: e.kind, ciphertext: e.ciphertext, at: new Date().toISOString() });
        }
        return send(200, { delivered: [...new Set(body.envelopes.map((e: { to_profile_id: string }) => e.to_profile_id))], undelivered: [] });
      }
      case 'GET /v1/mls/messages':
        return send(200, { messages: (queues[u.device] ?? []).slice(0, 200) });
      case 'POST /v1/mls/messages/ack':
        queues[u.device] = (queues[u.device] ?? []).filter((m) => !body.ids.includes(m.id));
        return send(200, {});
      case 'PUT /v1/me/now':
        return send(200, {});
      default:
        return send(404, {});
    }
  });
  return new Promise<{ url: string; close: () => void; log: string[] }>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const a = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${a.port}`, close: () => server.close(), log });
    }),
  );
}
