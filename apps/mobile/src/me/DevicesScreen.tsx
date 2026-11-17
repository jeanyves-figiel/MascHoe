import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api } from '../api/client';
import { addOwnDevices } from '../chat/engine';
import { tx } from '../i18n/app';
import { biometrics, getLock } from '../safety/lock';
import { color, space, type } from '../theme/tokens';
import { Banner, Button, ErrorText, ListRow, Loading, Section } from '../ui';
import { Qr } from './Qr';

type Device = { id: string; platform: string; last_seen_day: string; current: boolean };
type Link = { code: string; left: number; state: 'pending' | 'claimed' | 'confirmed'; platform?: string };

// Settings › Linked devices (R-01.6, R-01.8): list, sign out a device, link a new one by QR / code.
export function DevicesScreen() {
  const [list, setList] = useState<Device[] | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => api<{ devices: Device[] }>('GET', '/me/devices').then((r) => setList(r.devices), () => setList([])), []);
  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const start = async () => {
    setErr(null);
    setMsg(null);
    const r = await api<{ code: string; expires_in: number }>('POST', '/devices/link');
    const until = Date.now() + r.expires_in * 1000;
    setLink({ code: r.code, left: r.expires_in, state: 'pending' });
    stop();
    timer.current = setInterval(async () => {
      const left = Math.round((until - Date.now()) / 1000);
      if (left <= 0) {
        stop();
        setLink(null);
        return;
      }
      const s = await api<{ state: Link['state']; platform?: string }>('GET', `/devices/link/${r.code}`).catch(() => null);
      setLink((l) => (l && s ? { ...l, left, state: s.state, platform: s.platform } : l));
      if (s?.state === 'claimed') stop();
    }, 2000);
  };

  const allow = async () => {
    if (!link) return;
    const cfg = await getLock();
    if (cfg?.bio && !(await biometrics(tx.devices.confirm))) return;
    try {
      await api('POST', `/devices/link/${link.code}/confirm`);
      setLink(null);
      setMsg(tx.devices.adding);
      // give the new device a moment to sign in and publish its key packages
      let n = 0;
      for (let i = 0; i < 10 && n === 0; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        n = await addOwnDevices().catch(() => 0);
      }
      setMsg(tx.devices.done(n));
      load();
    } catch {
      setErr(tx.common.error);
    }
  };

  if (!list) return <Loading />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: 120 }}>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.devices.title}</Text>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.devices.hint}</Text>
      <Section>
        {list.map((d) => (
          <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <ListRow title={(tx.devices.platforms[d.platform] ?? d.platform) + (d.current ? ` · ${tx.devices.thisDevice}` : '')} sub={tx.devices.seen(d.last_seen_day)} />
            </View>
            {!d.current ? <Button small kind="ghost" title={tx.devices.remove} onPress={() => api('DELETE', `/me/devices/${d.id}`).then(load)} /> : null}
          </View>
        ))}
      </Section>
      {msg ? <Banner tone="trust" text={msg} /> : null}
      <ErrorText text={err} />
      {link?.state === 'claimed' ? (
        <View style={{ gap: space.m }}>
          <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.devices.wants(tx.devices.platforms[link.platform ?? 'web'] ?? '')}</Text>
          <Button testID="link-allow" kind="trust" title={tx.devices.confirm} onPress={allow} />
          <Button kind="ghost" title={tx.devices.deny} onPress={() => (stop(), setLink(null))} />
        </View>
      ) : link ? (
        <View style={{ alignItems: 'center', gap: space.m }}>
          <Text style={{ ...type.meta, color: color.fgSecondary, textAlign: 'center' }}>{tx.devices.linkHint}</Text>
          <Qr value={`thirstr://link/${link.code}`} />
          <Text testID="link-code" selectable style={{ ...type.display, color: color.fgPrimary, letterSpacing: 4 }}>
            {link.code}
          </Text>
          <Text style={{ ...type.meta, color: color.fgMuted }}>{tx.devices.expires(link.left)}</Text>
        </View>
      ) : list.length < 5 ? (
        <Button testID="link-start" kind="trust" title={tx.devices.link} onPress={() => start().catch(() => setErr(tx.common.error))} />
      ) : null}
    </ScrollView>
  );
}
