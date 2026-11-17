import React, { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import { api, ApiError, clearSession, Me } from '../api/client';
import type { Settings } from '../api/types';
import { useSession } from '../app/session';
import { askPushPermission } from '../chat/engine';
import { customQuickReplies, setCustomQuickReplies } from '../chat/quick';
import { tx } from '../i18n/app';
import { exportData } from './exportData';
import { type Prefs, prefs, setPrefs } from './prefs';
import { color, space, type } from '../theme/tokens';
import { Banner, Button, Chip, Chips, ErrorText, Field, ListRow, Loading, Section, Toggle } from '../ui';

type Nav = { navigate: (s: string, p?: object) => void };

// S-50 Settings (F-17). Every setting is server-enforced (R-17.1).
export function SettingsScreen({ navigation }: { navigation: Nav }) {
  const { me, setMe, signOut } = useSession();
  const [st, setSt] = useState<Settings | null>(me.settings ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [safeOffAsk, setSafeOffAsk] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [quick, setQuick] = useState<string[]>([]);
  const [pf, setPf] = useState<Prefs>(prefs());
  const [exported, setExported] = useState(false);
  const [lic, setLic] = useState(false);
  useEffect(() => {
    customQuickReplies().then(setQuick);
  }, []);

  useEffect(() => {
    api<Settings>('GET', '/me/settings').then(setSt).catch(() => {});
  }, []);

  if (!st) return <Loading />;

  const put = async (patch: Partial<Settings>) => {
    setErr(null);
    const prev = st;
    setSt({ ...st, ...patch });
    try {
      setSt(await api<Settings>('PATCH', '/me/settings', patch));
    } catch (e) {
      setSt(prev);
      setErr(e instanceof ApiError ? e.message : tx.common.error);
    }
  };
  const call = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tx.common.error);
    }
  };
  const safe = async (setting: string) => call(async () => setMe(await api<Me>('PUT', '/me/safe_mode', { setting, active: setting === 'on' })));

  // Settings search (R-17.3): matching sections stay visible.
  const show = (...labels: string[]) => !q.trim() || labels.some((l) => l.toLowerCase().includes(q.trim().toLowerCase()));
  const choice = <T extends string>(label: string, value: T, opts: Record<string, string>, on: (v: T) => void) =>
    show(label) ? (
      <View style={{ paddingVertical: space.s, gap: space.xs }}>
        <Text style={{ ...type.body, color: color.fgPrimary }}>{label}</Text>
        <Chips>
          {Object.entries(opts).map(([k, l]) => (
            <Chip key={k} label={l} on={value === k} fill={color.trust} onPress={() => on(k as T)} />
          ))}
        </Chips>
      </View>
    ) : null;
  const tog = (label: string, value: boolean, on: (v: boolean) => void, sub?: string) => (show(label, sub ?? '') ? <Toggle label={label} sub={sub} value={value} onChange={on} /> : null);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l, paddingBottom: 140, maxWidth: 560, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.settings.title}</Text>
      <Field label={tx.settings.search} value={q} onChangeText={setQ} placeholder={tx.settings.search} />
      <ErrorText text={err} />

      <Section title={tx.settings.visibility}>
        {tog(`${tx.settings.hideFrom}: ${tx.settings.hideUnverified}`, st.hide_from_unverified, (v) => put({ hide_from_unverified: v }))}
        {tog(`${tx.settings.hideFrom}: ${tx.settings.hideNew}`, st.hide_from_new, (v) => put({ hide_from_new: v }))}
        {show(tx.settings.hideAgeMin, tx.settings.hideAgeMax) ? (
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <View style={{ flex: 1 }}>
              <Field label={`${tx.settings.hideFrom}: ${tx.settings.hideAgeMin}`} keyboardType="number-pad" defaultValue={st.hide_from_age_min ? String(st.hide_from_age_min) : ''} onEndEditing={(e) => put({ hide_from_age_min: Number.parseInt(e.nativeEvent.text, 10) || null })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={`${tx.settings.hideFrom}: ${tx.settings.hideAgeMax}`} keyboardType="number-pad" defaultValue={st.hide_from_age_max ? String(st.hide_from_age_max) : ''} onEndEditing={(e) => put({ hide_from_age_max: Number.parseInt(e.nativeEvent.text, 10) || null })} />
            </View>
          </View>
        ) : null}
        {tog(`${tx.settings.showIn}: ${tx.settings.showGrid}`, st.show_in_grid, (v) => put({ show_in_grid: v }))}
        {tog(`${tx.settings.showIn}: ${tx.settings.showMap}`, st.show_in_map, (v) => put({ show_in_map: v }))}
        {tog(`${tx.settings.showIn}: ${tx.settings.showTonight}`, st.show_in_tonight, (v) => put({ show_in_tonight: v }))}
        {tog(`${tx.settings.showIn}: ${tx.settings.showActivities}`, st.show_in_activities, (v) => put({ show_in_activities: v }))}
        {tog(`${tx.settings.showIn}: ${tx.settings.showVenues}`, st.show_in_venues, (v) => put({ show_in_venues: v }))}
        {choice(tx.settings.showDistance, st.show_distance, tx.settings.distanceOpts, (v) => put({ show_distance: v }))}
        {tog(tx.settings.online, st.online_visible, (v) => put({ online_visible: v }), tx.settings.onlineSub)}
      </Section>

      <Section title={tx.settings.chat}>
        {tog(tx.settings.receipts, st.read_receipts, (v) => put({ read_receipts: v }), tx.settings.receiptsSub)}
        {choice(tx.settings.whoMessage, st.who_can_message, tx.settings.whoOpts, (v) => put({ who_can_message: v }))}
        {choice(tx.settings.explicit, st.explicit_from_strangers, tx.settings.explicitOpts, (v) => put({ explicit_from_strangers: v }))}
        {choice(tx.settings.disappearing, st.disappearing_default, tx.settings.disOpts, (v) => put({ disappearing_default: v }))}
        {tog(tx.prefs.autoDelete, pf.autoDelete || !!me.safe_mode_active, (v) => setPrefs({ autoDelete: v }).then(setPf))}
        {show(tx.settings.quickReplies) ? (
          <View style={{ gap: space.xs }}>
            <Text style={{ ...type.body, color: color.fgPrimary }}>{tx.settings.quickReplies}</Text>
            <Text style={{ ...type.meta, color: color.fgMuted }}>{tx.settings.quickHint}</Text>
            {[0, 1, 2].map((i) => (
              <Field
                key={i}
                label={`${i + 1}`}
                maxLength={40}
                value={quick[i] ?? ''}
                onChangeText={(v) => {
                  const next = [...quick];
                  next[i] = v;
                  setQuick(next);
                }}
                onEndEditing={() => setCustomQuickReplies(quick)}
              />
            ))}
          </View>
        ) : null}
      </Section>

      <Section title={tx.settings.notifications}>
        {show(tx.settings.notifications) ? <Text style={{ ...type.meta, color: color.fgSecondary, paddingHorizontal: space.m, paddingTop: space.s }}>{tx.settings.notifIntro}</Text> : null}
        {Platform.OS === 'ios' && show(tx.settings.enablePush) ? <ListRow title={tx.settings.enablePush} onPress={() => askPushPermission()} /> : null}
        {Object.entries(tx.settings.pushTypes).map(([k, label]) => (
          <React.Fragment key={k}>{tog(label, st.push?.[k] !== false, (v) => put({ push: { ...(st.push ?? {}), [k]: v } }))}</React.Fragment>
        ))}
        {tog(tx.settings.quiet, !!st.quiet_hours, (v) => put({ quiet_hours: v ? { from: 23, to: 7, tz_offset_min: -new Date().getTimezoneOffset() } : null }), tx.settings.quietSub)}
        {st.quiet_hours && show(tx.settings.quiet) ? (
          <View style={{ gap: space.s }}>
            {(['from', 'to'] as const).map((k) => (
              <View key={k} style={{ gap: space.xs }}>
                <Text style={{ ...type.meta, color: color.fgSecondary }}>{k === 'from' ? tx.settings.quietFrom : tx.settings.quietTo}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <Chip key={h} label={`${h}:00`} on={st.quiet_hours![k] === h} fill={color.trust} onPress={() => put({ quiet_hours: { ...st.quiet_hours!, [k]: h, tz_offset_min: -new Date().getTimezoneOffset() } })} />
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      <Section title={tx.settings.safety}>
        {choice(tx.settings.safeMode, me.safe_mode, tx.settings.safeOpts, (v) => (v === 'off' ? setSafeOffAsk(true) : safe(v)))}
        {safeOffAsk ? (
          <View style={{ gap: space.s }}>
            <Banner tone="danger" text={tx.settings.safeOffWarn} />
            <Button kind="danger" small title={tx.common.confirm} onPress={() => { setSafeOffAsk(false); safe('off'); }} />
          </View>
        ) : null}
        {show(tx.settings.blocked) ? <ListRow testID="settings-blocked" title={tx.settings.blocked} onPress={() => navigation.navigate('Blocked')} /> : null}
        {show(tx.safety.menu) ? <ListRow title={tx.safety.menu} onPress={() => navigation.navigate('Safety')} /> : null}
        {show(tx.safety.lock.title) ? <ListRow testID="settings-applock" title={tx.safety.lock.title} onPress={() => navigation.navigate('AppLock')} /> : null}
        {show(tx.prefs.verification) ? (
          <ListRow
            title={tx.prefs.verification}
            sub={me.verified ? tx.prefs.verified(me.verified_since ?? '') : tx.prefs.notVerified}
            right={me.verified ? tx.prefs.reverify : undefined}
            onPress={() => navigation.navigate('Verify')}
          />
        ) : null}
      </Section>

      <Section title={tx.settings.account}>
        {me.status === 'paused' ? (
          <ListRow title={tx.settings.resume} onPress={() => call(async () => setMe(await api<Me>('POST', '/account/resume')))} />
        ) : (
          <ListRow title={tx.settings.pause} onPress={() => call(async () => setMe(await api<Me>('POST', '/account/pause')))} />
        )}
        <ListRow testID="settings-devices" title={tx.devices.title} onPress={() => navigation.navigate('Devices')} />
        <ListRow testID="settings-export" title={tx.exportData.title} sub={exported ? tx.exportData.ready : tx.exportData.hint} onPress={() => call(async () => { await exportData(); setExported(true); })} />
        <ListRow testID="logout" title={tx.settings.logout} onPress={() => call(async () => { await api('POST', '/auth/logout').catch(() => {}); await clearSession(); signOut(); })} />
        <ListRow title={tx.settings.logoutAll} onPress={() => call(async () => { await api('POST', '/auth/logout_all'); await clearSession(); signOut(); })} />
        <ListRow title={tx.settings.delete} danger onPress={() => setDel('')} />
        {del !== null ? (
          <View style={{ gap: space.s }}>
            <Field label={tx.settings.deleteConfirm} value={del} onChangeText={setDel} autoCapitalize="characters" />
            <Button kind="danger" title={tx.settings.delete} disabled={del !== 'DELETE'} onPress={() => call(async () => { await api('DELETE', '/account', { confirm: 'DELETE' }); await clearSession(); signOut(); })} />
          </View>
        ) : null}
      </Section>

      <Section title={tx.prefs.app}>
        {choice(tx.prefs.units, pf.units, tx.prefs.unitOpts, (v) => setPrefs({ units: v as 'km' | 'mi' }).then(setPf))}
        {Platform.OS !== 'web' ? tog(tx.prefs.haptics, pf.haptics, (v) => setPrefs({ haptics: v }).then(setPf)) : null}
        {show(tx.prefs.language) ? <ListRow title={tx.prefs.language} sub={tx.prefs.languageSub} onPress={() => Linking.openSettings().catch(() => {})} /> : null}
        {show(tx.prefs.privacy) ? <ListRow title={tx.prefs.privacy} onPress={() => Linking.openURL('https://thirstr.fun/privacy/')} /> : null}
        {show(tx.prefs.licenses) ? <ListRow title={tx.prefs.licenses} onPress={() => setLic(!lic)} /> : null}
        {lic ? <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.prefs.licensesBody}</Text> : null}
      </Section>
    </ScrollView>
  );
}
