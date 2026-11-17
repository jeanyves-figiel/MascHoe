import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import type { Kind, MyProfile } from '../api/types';
import { useSession } from '../app/session';
import { LocationSheet } from '../explore/LocationSheet';
import { tx } from '../i18n/app';
import { color, modeColor, radius, space, type } from '../theme/tokens';
import { Banner, Button, ErrorText, ListRow, Photo, Section, Segmented, Toggle, VerifiedTick, Wordmark } from '../ui';
import type { Notice } from '../trust/NoticesScreen';
import { NowSheet } from './NowSheet';

type Nav = { navigate: (s: string, p?: object) => void };
const KINDS: Kind[] = ['now', 'friends', 'sport'];
const kindMode = { now: 'hookup', friends: 'friends', sport: 'sport' } as const;

// S-40 Me (F-06, F-07): profile switcher, completeness, preview-as, quick toggles.
export function MeScreen({ navigation }: { navigation: Nav }) {
  const { me, setMe, refresh } = useSession();
  const insets = useSafeAreaInsets();
  const profiles = me.profiles ?? (me.profile ? [me.profile] : []);
  const [kind, setKind] = useState<Kind>('now');
  const [loc, setLoc] = useState(false);
  const [now, setNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p: MyProfile | undefined = profiles.find((x) => x.kind === kind);
  const accent = modeColor[kindMode[kind]];
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    api<{ notices: Notice[] }>('GET', '/me/notices').then((r) => setNotices(r.notices), () => {});
  }, []);
  // Newest suspension notice while the account is suspended (the server lifts it when it ends).
  const suspended = me.status === 'suspended' ? notices.find((n) => n.action === 'suspend' && n.ends_at) : undefined;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tx.common.error);
    } finally {
      setBusy(false);
    }
  };

  const main = p?.photos.find((x) => x.slot === 0);
  const level = me.location?.level ?? 'city';

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: insets.top + space.s, gap: space.l, paddingBottom: 140, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <Wordmark />
        <Segmented
          grow
          label="Profile"
          value={kind}
          onChange={setKind}
          fills={{ now: color.hookup, friends: color.friends, sport: color.sport }}
          options={KINDS.map((k) => ({ value: k, label: tx.modes[kindMode[k]] }))}
        />
        {me.status === 'paused' ? <Banner tone="warn" text={tx.me.paused} /> : null}
        {p ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.l, alignItems: 'center' }}>
              <Photo uri={main?.url} id={p.id} label={p.display_name} style={{ width: 96, height: 120, borderRadius: radius.md, borderWidth: 3, borderColor: accent }} />
              <View style={{ flex: 1, gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <Text style={{ ...type.title, color: color.fgPrimary }}>
                    {p.display_name}, {p.age}
                  </Text>
                  {me.verified ? <VerifiedTick size={18} /> : null}
                </View>
                <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.me.completeness(p.completeness)}</Text>
                <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: color.line, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p.completeness }}>
                  <View style={{ width: `${p.completeness}%`, height: 8, backgroundColor: accent }} />
                </View>
              </View>
            </View>
            <Button testID="edit-profile" title={tx.me.editProfile} fill={accent} onPress={() => navigation.navigate('EditProfile', { id: p.id })} />
            <View style={{ gap: space.xs }}>
              <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.me.previewAs}</Text>
              <View style={{ flexDirection: 'row', gap: space.s }}>
                {(['stranger', 'verified', 'chats'] as const).map((as) => (
                  <Pressable
                    key={as}
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('Profile', { id: p.id, preview: as })}
                    style={{ flex: 1, paddingVertical: space.s, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, alignItems: 'center' }}
                  >
                    <Text style={{ ...type.meta, color: color.fgPrimary }}>{tx.me.previews[as]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={{ gap: space.s }}>
            <Text style={{ ...type.body, color: color.fgSecondary }}>{tx.me.createHint}</Text>
            <Button testID={`create-${kind}`} title={tx.me.createProfile(tx.modes[kindMode[kind]])} fill={accent} busy={busy} onPress={() => run(() => api('POST', '/me/profiles', { kind }))} />
          </View>
        )}

        {suspended ? (
          <Banner tone="danger" text={tx.notices.suspended(new Date(suspended.ends_at!).toLocaleDateString())} onPress={() => navigation.navigate('Notices')} />
        ) : notices.some((n) => !n.seen) ? (
          <Banner tone="warn" text={tx.notices.banner} onPress={() => navigation.navigate('Notices')} />
        ) : null}
        {!me.verified ? <Banner text={tx.explore.verifyBanner} onPress={() => navigation.navigate('Verify')} /> : null}

        <Section>
          <ListRow testID="me-location" title={tx.me.location} right={me.incognito ? tx.location.incognito : tx.location.levels[level]?.[0]} onPress={() => setLoc(true)} />
          <Toggle
            label={tx.me.incognito}
            sub={me.verified ? tx.location.incognitoSub : tx.common.verifyToDo}
            disabled={!me.verified}
            value={!!me.incognito}
            onChange={(v) => run(async () => setMe(await api('PATCH', '/me/visibility', { incognito: v })))}
          />
          <ListRow testID="me-now" title={tx.me.now} right={me.now ? tx.now[me.now.status] : undefined} onPress={() => setNow(true)} />
        </Section>

        <Section>
          <ListRow title={tx.me.taps} onPress={() => navigation.navigate('Taps')} />
          <ListRow testID="me-albums" title={tx.albums.menu} onPress={() => navigation.navigate('Albums')} />
          <ListRow testID="me-settings" title={tx.me.settings} onPress={() => navigation.navigate('Settings')} />
          <ListRow testID="me-notices" title={tx.notices.title} onPress={() => navigation.navigate('Notices')} />
          {p && p.kind !== 'now' ? <ListRow title={tx.me.deleteProfile} danger onPress={() => run(() => api('DELETE', `/me/profiles/${p.id}`))} /> : null}
        </Section>
        <ErrorText text={err} />
      </ScrollView>
      <LocationSheet visible={loc} onClose={() => setLoc(false)} />
      <NowSheet visible={now} onClose={() => setNow(false)} />
    </View>
  );
}
