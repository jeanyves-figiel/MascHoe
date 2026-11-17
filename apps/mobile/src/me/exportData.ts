// R-01.11 Download my data: server archive + device-only data (chats, notes, trusted-contact names).
import { Platform, Share } from 'react-native';
import { api } from '../api/client';
import * as E from '../chat/engine';
import { kv } from '../chat/kv';

export async function exportData(): Promise<void> {
  const server = await api<Record<string, unknown>>('GET', '/account/export');
  const chats = await Promise.all(
    E.getConvs().map(async (c) => ({
      name: c.name,
      peer_profile: c.ctx ? undefined : c.peer,
      group: c.ctx,
      messages: (await E.messages(c.id)).map((m) => {
        const p = m.p as { t: string; text?: string };
        return { from: m.from, at: new Date(m.at).toISOString(), type: p.t, text: p.text };
      }),
    })),
  );
  const notes = await Promise.all((await kv.keys('note:')).map(async (k) => ({ profile: k.slice(5), note: await kv.get(k) })));
  const contacts = ((await kv.get<{ label: string; accepted?: boolean }[]>('safety:contacts')) ?? []).map((c) => ({ name: c.label, accepted: !!c.accepted }));
  const json = JSON.stringify({ ...server, device: { chats, private_notes: notes, trusted_contacts: contacts } }, null, 2);
  const name = `thirstr-export-${new Date().toISOString().slice(0, 10)}.json`;

  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(json);
  await Share.share({ url: f.uri, title: name });
}
