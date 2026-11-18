import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import type { Mode, MyProfile } from '../api/types';
import { useSession } from '../app/session';
import { LocationSheet } from '../explore/LocationSheet';
import { tx } from '../i18n/app';
import { color, modeColor, radius, space, type } from '../theme/tokens';
import Svg, { Circle } from 'react-native-svg';
import { Banner, Button, ErrorText, ListRow, Photo, Section, SectionLabel, Segmented, Toggle, VerifiedTick, Wordmark } from '../ui';
import { LENSES } from '../profile/lens';
import { LensPreview } from './LensPreview';
import type { Notice } from '../trust/NoticesScreen';
import { NowSheet } from './NowSheet';
import { prefs, setPrefs } from './prefs';
import { SignInEmailSheet } from './SignInEmail';

type Nav = { navigate: (s: string, p?: object) => void };
// Accounts from before one-profile-three-lenses (D-15, #96) get a one-time notice.
const LENSES_SHIPPED = Date.parse('2026-11-19T00:00:00Z');

// S-60 Me (F-06, F-07): profile card, "Show me in" lenses, lens preview, quick toggles.
export function MeScreen({ navigation }: { navigation: Nav }) {
  const { me, setMe, refresh, mode, setMode } = useSession();
  const insets = useSafeAreaInsets();
  const p: MyProfile | undefined = me.profile ?? me.profiles?.[0];
  const showIn: Mode[] = p?.show_in ?? ['hookup'];
  // The lens preview follows the app mode and changes it (R-04.1, R-06.7).
  const [lensNote, setLensNote] = useState<string | null>(null);
  const [mergedDone, setMergedDone] = useState(!!prefs().lensNoticeDone);
  const merged = !mergedDone && !!me.created_at && Date.parse(me.created_at) < LENSES_SHIPPED;
  const [loc, setLoc] = useState(false);
  const [now, setNow] = useState(false);
  const [busy, setBusy] = useState(false);
  // RF-7: offer a sign-in email once, a week after sign-up, if none is on file.
  const [emailSheet, setEmailSheet] = useState(false);
  const [nudgeDone, setNudgeDone] = useState(!!prefs().emailNudgeDone);
  const [openedAt] = useState(() => Date.now());
  const weekOld = !!me.created_at && openedAt - new Date(me.created_at).getTime() > 7 * 86400000;
  const emailNudge = weekOld && me.has_email === false && !nudgeDone;
  const dismissNudge = () => {
    setNudgeDone(true);
    setPrefs({ emailNudgeDone: true });
  };
  const [err, setErr] = useState<string | null>(null);
  const accent = modeColor[mode];
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

  // R-06.1a: at least one lens stays on. Turning Sport on without sports opens the sport fields.
  const setLens = (m: Mode, on: boolean) => {
    if (!p) return;
    const next = on ? LENSES.filter((x) => x === m || showIn.includes(x)) : showIn.filter((x) => x !== m);
    if (next.length === 0) {
      setLensNote(tx.me.lensLastOne);
      return;
    }
    setLensNote(null);
    setMode(m);
    run(async () => {
      await api('PATCH', `/me/profiles/${p.id}`, { show_in: next });
      const sports = p.fields.sports;
      if (m === 'sport' && on && !(Array.isArray(sports) && sports.length)) navigation.navigate('EditProfile', { id: p.id, focus: 'sport' });
    });
  };
  const level = me.location?.level ?? 'city';

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: insets.top + space.s, gap: space.l, paddingBottom: 140, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark />
        </View>
        {me.status === 'paused' ? <Banner tone="warn" text={tx.me.paused} /> : null}
        {p ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.l, alignItems: 'center', padding: space.l, borderRadius: 24, backgroundColor: color.bgRaised }}>
              <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
                <Ring pct={p.completeness} c={accent} />
                <Photo uri={main?.url} id={p.id} label={p.display_name} style={{ position: 'absolute', width: 86, height: 86, borderRadius: 43 }} />
              </View>
              <View style={{ flex: 1, gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <Text style={{ ...type.title, color: color.fgPrimary }}>
                    {p.display_name}, {p.age}
                  </Text>
                  {me.verified ? <VerifiedTick size={18} /> : null}
                </View>
                <Text accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p.completeness }} style={{ ...type.meta, color: accent }}>
                  {tx.me.completeness(p.completeness)}
                </Text>
              </View>
            </View>
            <Button testID="edit-profile" title={tx.me.editProfile} fill={color.fgPrimary} onPress={() => navigation.navigate('EditProfile', { id: p.id })} />
            {merged ? (
              <Banner
                tone="personal"
                text={tx.me.mergedNotice}
                onPress={() => {
                  setMergedDone(true);
                  setPrefs({ lensNoticeDone: true });
                }}
              />
            ) : null}
            <Section title={tx.me.showMeIn}>
              {LENSES.map((m) => (
                <Toggle key={m} label={tx.modes[m]} sub={tx.me.lensWhat[m]} value={showIn.includes(m)} tone={modeColor[m]} disabled={busy} onChange={(v) => setLens(m, v)} />
              ))}
            </Section>
            {lensNote ? <Banner tone="warn" text={lensNote} /> : null}
            <View style={{ gap: space.s }}>
              <SectionLabel>{tx.me.seeYourselfIn}</SectionLabel>
              <Segmented grow label={tx.me.seeYourselfIn} value={mode} onChange={setMode} fills={modeColor} options={LENSES.map((m) => ({ value: m, label: tx.modes[m] }))} />
              <LensPreview profile={p} mode={mode} shown={showIn.includes(mode)} />
              <View style={{ flexDirection: 'row', gap: space.s }}>
                {(['stranger', 'verified', 'chats'] as const).map((as) => (
                  <Pressable
                    key={as}
                    accessibilityRole="button"
                    accessibilityLabel={`${tx.me.previewAs} ${tx.me.previews[as]}`}
                    onPress={() => navigation.navigate('Profile', { id: p.id, preview: as, mode })}
                    style={{ flex: 1, height: 40, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.bgRaised, alignItems: 'center' }}
                  >
                    <Text style={{ ...type.meta, color: color.fgPrimary }}>{tx.me.previews[as]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {suspended ? (
          <Banner tone="danger" text={tx.notices.suspended(new Date(suspended.ends_at!).toLocaleDateString())} onPress={() => navigation.navigate('Notices')} />
        ) : notices.some((n) => !n.seen) ? (
          <Banner tone="warn" text={tx.notices.banner} onPress={() => navigation.navigate('Notices')} />
        ) : null}
        {!me.verified ? <Banner text={tx.explore.verifyBanner} onPress={() => navigation.navigate('Verify')} /> : null}
        {emailNudge ? (
          <View testID="email-nudge" style={{ gap: space.s }}>
            <Banner tone="personal" text={tx.signInEmail.nudge} onPress={() => { setEmailSheet(true); dismissNudge(); }} />
            <Pressable accessibilityRole="button" onPress={dismissNudge} style={{ alignSelf: 'flex-end', paddingHorizontal: space.s }}>
              <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.signInEmail.dismiss}</Text>
            </Pressable>
          </View>
        ) : null}

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
          <ListRow testID="me-safety" title={tx.safety.menu} onPress={() => navigation.navigate('Safety')} />
          <ListRow testID="me-settings" title={tx.me.settings} onPress={() => navigation.navigate('Settings')} />
          <ListRow testID="me-notices" title={tx.notices.title} onPress={() => navigation.navigate('Notices')} />
        </Section>
        <ErrorText text={err} />
      </ScrollView>
      <LocationSheet visible={loc} onClose={() => setLoc(false)} />
      <NowSheet visible={now} onClose={() => setNow(false)} />
      <SignInEmailSheet visible={emailSheet} onClose={() => setEmailSheet(false)} />
    </View>
  );
}

// Completeness ring around the main photo (App v2, issue 58).
function Ring({ pct, c }: { pct: number; c: string }) {
  const r = 48;
  const len = 2 * Math.PI * r;
  return (
    <Svg width={104} height={104} viewBox="0 0 104 104">
      <Circle cx={52} cy={52} r={r} stroke={color.line} strokeWidth={5} fill="none" />
      <Circle cx={52} cy={52} r={r} stroke={c} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={`${(len * Math.max(0, Math.min(100, pct))) / 100} ${len}`} transform="rotate(-90 52 52)" />
    </Svg>
  );
}
