import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { api, ApiError } from '../api/client';
import type { Mode, MyProfile } from '../api/types';
import { useSession } from '../app/session';
import { listAlbums, onAlbums } from '../chat/albums';
import { type Level, LocationSheet, quickLevel } from '../explore/LocationSheet';
import { tx } from '../i18n/app';
import { v3 } from '../i18n/v3';
import { LENSES } from '../profile/lens';
import { contacts } from '../safety/safety';
import { color, font, modeColor, radius, space, touch, type } from '../theme/tokens';
import type { Notice } from '../trust/NoticesScreen';
import { Banner, Button, ErrorText, Icon, Photo, Sheet, VerifiedTick } from '../ui';
import { HiddenPanel } from './HiddenPanel';
import { NowSheet } from './NowSheet';
import { prefs, setPrefs } from './prefs';
import { Qr } from './Qr';
import { SignInEmailSheet } from './SignInEmail';

type Nav = { navigate: (s: string, p?: object) => void };
// Accounts from before one-profile-three-lenses (D-15, #96) get a one-time notice.
const LENSES_SHIPPED = Date.parse('2026-11-19T00:00:00Z');
const LEVELS: Level[] = ['hidden', 'city', 'area', 'exact'];

// S-60 Me v3 (#102): profile card, "How you show up right now" (location incl. Hidden panel #114, Now),
// "Show me in" lens tiles, Yours (albums, date check-in). Settings behind the gear.
export function MeScreen({ navigation }: { navigation: Nav }) {
  const { me, setMe, refresh, setMode } = useSession();
  const insets = useSafeAreaInsets();
  const p: MyProfile | undefined = me.profile ?? me.profiles?.[0];
  const showIn: Mode[] = p?.show_in ?? ['hookup'];
  const [lensNote, setLensNote] = useState(false);
  const [mergedDone, setMergedDone] = useState(!!prefs().lensNoticeDone);
  const merged = !mergedDone && !!me.created_at && Date.parse(me.created_at) < LENSES_SHIPPED;
  const [locSheet, setLocSheet] = useState<Level | null>(null);
  const [now, setNow] = useState(false);
  const [qr, setQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailSheet, setEmailSheet] = useState(false);
  const [nudgeDone, setNudgeDone] = useState(!!prefs().emailNudgeDone);
  const [openedAt] = useState(() => Date.now());
  const weekOld = !!me.created_at && openedAt - new Date(me.created_at).getTime() > 7 * 86400000;
  const emailNudge = weekOld && me.has_email === false && !nudgeDone;
  const [err, setErr] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [albums, setAlbums] = useState(0);
  const [trusted, setTrusted] = useState(0);

  useEffect(() => {
    api<{ notices: Notice[] }>('GET', '/me/notices').then((r) => setNotices(r.notices), () => {});
    const a = () => listAlbums().then((l) => setAlbums(l.length), () => {});
    a();
    return onAlbums(a);
  }, []);
  useFocusEffect(
    useCallback(() => {
      contacts().then((c) => setTrusted(c.filter((x) => x.accepted).length), () => {});
    }, []),
  );

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

  // R-06.1a: at least one lens stays on. Turning Sport on without sports opens the sport fields.
  const setLens = (m: Mode) => {
    if (!p || busy) return;
    const on = !showIn.includes(m);
    const next = on ? LENSES.filter((x) => x === m || showIn.includes(x)) : showIn.filter((x) => x !== m);
    if (next.length === 0) return setLensNote(true);
    setLensNote(false);
    if (on) setMode(m);
    run(async () => {
      await api('PATCH', `/me/profiles/${p.id}`, { show_in: next });
      const sports = p.fields.sports;
      if (m === 'sport' && on && !(Array.isArray(sports) && sports.length)) navigation.navigate('EditProfile', { id: p.id, focus: 'sport' });
    });
  };

  // One tap for Hidden / City / Area; Exact (TTL, audience, confirm) and no-position cases open the sheet.
  const level = (me.location?.level ?? 'city') as Level;
  const pickLevel = (l: Level) => {
    if ((l === 'hidden' || l === 'exact') && !me.verified) return navigation.navigate('Verify');
    if (l === 'exact') return setLocSheet('exact');
    if (l === level) return;
    setBusy(true);
    setErr(null);
    quickLevel(l, l === 'hidden' ? { until: null, return_level: level === 'city' ? 'city' : 'area' } : undefined)
      .then((r) => (r ? setMe(r) : setLocSheet(l)))
      .catch((e) => setErr(e instanceof ApiError ? e.message : tx.common.error))
      .finally(() => setBusy(false));
  };

  // One banner slot, highest priority only (S-60).
  const suspended = me.status === 'suspended' ? notices.find((n) => n.action === 'suspend' && n.ends_at) : undefined;
  const banner = suspended ? (
    <Banner tone="danger" text={tx.notices.suspended(new Date(suspended.ends_at!).toLocaleDateString())} onPress={() => navigation.navigate('Notices')} />
  ) : notices.some((n) => !n.seen) ? (
    <Banner tone="warn" text={tx.notices.banner} onPress={() => navigation.navigate('Notices')} />
  ) : !me.verified ? (
    <Banner text={tx.explore.verifyBanner} onPress={() => navigation.navigate('Verify')} />
  ) : emailNudge ? (
    <Banner
      testID="email-nudge"
      tone="personal"
      text={tx.signInEmail.nudge}
      onPress={() => {
        setEmailSheet(true);
        setNudgeDone(true);
        setPrefs({ emailNudgeDone: true });
      }}
    />
  ) : me.status === 'paused' ? (
    <Banner tone="warn" text={tx.me.paused} onPress={() => navigation.navigate('AccountSettings')} />
  ) : merged ? (
    <Banner tone="personal" text={tx.me.mergedNotice} onPress={() => { setMergedDone(true); setPrefs({ lensNoticeDone: true }); }} />
  ) : null;

  const main = p?.photos.find((x) => x.slot === 0);
  const photoCount = p?.photos.filter((x) => x.url && x.status !== 'rejected').length ?? 0;
  const accent = modeColor.hookup;
  const others = v3.me.othersSee[level];

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: insets.top + space.s, gap: space.xl, paddingBottom: 140, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={{ ...type.display, fontSize: 34, lineHeight: 40, color: color.fgPrimary }}>
            {tx.me.title}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {p ? <RoundBtn testID="me-qr" label={v3.me.qr} onPress={() => setQr(true)} icon={<QrIcon />} /> : null}
            <RoundBtn testID="me-settings" label={v3.settings.title} onPress={() => navigation.navigate('Settings')} icon={<GearIcon />} />
          </View>
        </View>

        {banner}

        {p ? (
          <View style={{ padding: space.l, borderRadius: radius.tray, backgroundColor: color.bgRaised, gap: space.l }}>
            <View style={{ flexDirection: 'row', gap: space.l, alignItems: 'center' }}>
              <View style={{ width: 92, height: 92, alignItems: 'center', justifyContent: 'center' }}>
                <Ring pct={p.completeness} c={accent} />
                <Photo uri={main?.url} id={p.id} label={p.display_name} style={{ position: 'absolute', width: 76, height: 76, borderRadius: 38 }} />
              </View>
              <View style={{ flex: 1, gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <Text style={{ ...type.title, color: color.fgPrimary, flexShrink: 1 }} numberOfLines={1}>
                    {p.display_name}, {p.age}
                  </Text>
                  {me.verified ? <VerifiedTick size={18} /> : null}
                </View>
                <Text accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p.completeness }} style={{ ...type.meta, fontFamily: font.bold, color: accent }}>
                  {tx.me.completeness(p.completeness)}
                </Text>
                {p.completeness < 100 ? (
                  <Pressable accessibilityRole="link" onPress={() => navigation.navigate('EditProfile', { id: p.id })} hitSlop={8}>
                    <Text style={{ ...type.meta, color: color.fgSecondary }}>{photoCount < 3 ? v3.me.nextPhoto : v3.me.nextStep}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <View style={{ flex: 1 }}>
                <Button testID="edit-profile" small title={tx.me.editProfile} fill={color.fgPrimary} onPress={() => navigation.navigate('EditProfile', { id: p.id })} />
              </View>
              <View style={{ flex: 1 }}>
                <Button testID="me-preview" small kind="secondary" title={v3.me.preview} onPress={() => navigation.navigate('LensPreview')} />
              </View>
            </View>
          </View>
        ) : null}

        <View style={{ gap: space.s }}>
          <GroupLabel tone={color.trust}>{v3.me.rightNow}</GroupLabel>
          <View style={{ borderRadius: radius.md, backgroundColor: color.bgRaised, overflow: 'hidden' }}>
            <View style={{ padding: space.l, paddingTop: space.m, gap: space.m }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                <IconTile tone={color.trust}>
                  <Icon.Pin size={18} c={color.trust} />
                </IconTile>
                <View style={{ flex: 1 }}>
                  <Text style={rowTitle}>{tx.me.location}</Text>
                  <Text testID="me-others-see" style={rowSub}>
                    {others}
                  </Text>
                </View>
              </View>
              <View testID="me-location" accessibilityRole="radiogroup" accessibilityLabel={tx.me.location} style={{ flexDirection: 'row', padding: 4, gap: 2, borderRadius: radius.pill, backgroundColor: color.bgBase }}>
                {LEVELS.map((l) => {
                  const on = l === level;
                  const locked = (l === 'hidden' || l === 'exact') && !me.verified;
                  return (
                    <Pressable
                      key={l}
                      testID={`me-level-${l}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on, disabled: busy }}
                      accessibilityLabel={tx.location.levels[l][0]}
                      onPress={() => pickLevel(l)}
                      style={{ flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, backgroundColor: on ? color.trust : 'transparent', opacity: locked ? 0.5 : 1 }}
                    >
                      {locked ? <Icon.Lock size={11} c={color.fgSecondary} /> : null}
                      <Text numberOfLines={1} style={{ ...type.meta, fontFamily: font.bold, fontSize: 14, color: on ? color.onAccent : color.fgSecondary }}>
                        {tx.location.levels[l][0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {!me.verified ? <Text style={{ ...type.meta, color: color.fgMuted }}>{v3.me.verifyLocked}</Text> : null}
              {level === 'hidden' ? <HiddenPanel me={me} setMe={setMe} /> : null}
            </View>
            <Row testID="me-now" onPress={() => setNow(true)} label={tx.me.now}>
              <IconTile tone={color.hookup}>
                <Icon.Bolt size={18} c={color.hookup} />
              </IconTile>
              <View style={{ flex: 1 }}>
                <Text style={rowTitle}>{tx.me.now}</Text>
                <Text style={rowSub}>{v3.me.nowSub}</Text>
              </View>
              <Text style={rowValue}>{me.now ? tx.now[me.now.status] : v3.me.off}</Text>
              <Icon.Next />
            </Row>
          </View>
        </View>

        {p ? (
          <View style={{ gap: space.s }}>
            <GroupLabel>{tx.me.showMeIn}</GroupLabel>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              {LENSES.map((m) => {
                const on = showIn.includes(m);
                const c = modeColor[m];
                return (
                  <Pressable
                    key={m}
                    testID={`lens-${m}`}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on, disabled: busy }}
                    accessibilityLabel={`${tx.me.showMeIn} ${tx.modes[m]}`}
                    onPress={() => setLens(m)}
                    style={{ flex: 1, minHeight: 112, padding: space.m, gap: 6, borderRadius: 18, borderWidth: 2, borderColor: on ? c : color.line, backgroundColor: on ? `${c}1F` : color.bgRaised }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c }} />
                      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c : color.line }}>
                        {on ? <Icon.Check size={12} /> : null}
                      </View>
                    </View>
                    <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.modes[m]}</Text>
                    <Text style={{ ...type.meta, fontSize: 12, lineHeight: 16, color: color.fgSecondary }}>{v3.me.lensShort[m]}</Text>
                  </Pressable>
                );
              })}
            </View>
            {lensNote ? <Text style={{ ...type.meta, color: color.personal }}>{tx.me.lensLastOne}</Text> : null}
            <Pressable testID="me-see-how" accessibilityRole="link" onPress={() => navigation.navigate('LensPreview')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.s, paddingHorizontal: space.xs, minHeight: touch }}>
              <Text style={{ ...type.meta, fontFamily: font.bold, fontSize: 14, color: color.trust }}>{v3.me.seeHow}</Text>
              <Icon.Next c={color.trust} />
            </Pressable>
          </View>
        ) : null}

        <View style={{ gap: space.s }}>
          <GroupLabel>{v3.me.yours}</GroupLabel>
          <View style={{ borderRadius: radius.md, backgroundColor: color.bgRaised, overflow: 'hidden' }}>
            <Row testID="me-albums" onPress={() => navigation.navigate('Albums')} label={tx.albums.title} first>
              <IconTile>
                <Icon.Lock size={18} c={color.fgPrimary} />
              </IconTile>
              <View style={{ flex: 1 }}>
                <Text style={rowTitle}>{tx.albums.title}</Text>
                <Text style={rowSub}>{v3.me.albumsSub}</Text>
              </View>
              {albums ? <Text style={rowValue}>{albums}</Text> : null}
              <Icon.Next />
            </Row>
            <Row testID="me-safety" onPress={() => navigation.navigate('Safety')} label={v3.me.checkin}>
              <IconTile>
                <Icon.Shield size={18} c={color.fgPrimary} />
              </IconTile>
              <View style={{ flex: 1 }}>
                <Text style={rowTitle}>{v3.me.checkin}</Text>
                <Text style={rowSub}>{v3.me.checkinSub(trusted)}</Text>
              </View>
              <Icon.Next />
            </Row>
          </View>
        </View>
        <ErrorText text={err} />
      </ScrollView>
      <LocationSheet visible={!!locSheet} initial={locSheet ?? undefined} onClose={() => setLocSheet(null)} />
      <NowSheet visible={now} onClose={() => setNow(false)} />
      <SignInEmailSheet visible={emailSheet} onClose={() => setEmailSheet(false)} />
      {p ? <QrSheet visible={qr} profileId={p.id} onClose={() => setQr(false)} /> : null}
    </View>
  );
}

const rowTitle = { ...type.body, fontFamily: font.medium, fontSize: 16, color: color.fgPrimary };
const rowSub = { ...type.meta, color: color.fgSecondary };
const rowValue = { ...type.meta, fontSize: 14, color: color.fgSecondary };

export function GroupLabel({ children, tone = color.fgMuted }: { children: React.ReactNode; tone?: string }) {
  return <Text style={{ ...type.caption, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: tone, marginHorizontal: space.xs }}>{children}</Text>;
}

export function IconTile({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tone ? `${tone}29` : color.bgOverlay }}>{children}</View>;
}

function Row({ children, onPress, testID, label, first }: { children: React.ReactNode; onPress?: () => void; testID?: string; label?: string; first?: boolean }) {
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.m, minHeight: 60, paddingHorizontal: space.l, paddingVertical: space.s, borderTopWidth: first ? 0 : 1, borderTopColor: color.lineSubtle };
  if (!onPress)
    return (
      <View testID={testID} style={style}>
        {children}
      </View>
    );
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [style, pressed && { backgroundColor: color.bgOverlay }]}>
      {children}
    </Pressable>
  );
}

function RoundBtn({ icon, label, onPress, testID }: { icon: React.ReactNode; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: touch, height: touch, borderRadius: touch / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? color.bgOverlay : color.bgRaised })}>
      {icon}
    </Pressable>
  );
}

function GearIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.fgPrimary} strokeWidth={2} strokeLinecap="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  );
}

function QrIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.fgPrimary} strokeWidth={2}>
      <Rect x={3} y={3} width={7} height={7} rx={1.5} />
      <Rect x={14} y={3} width={7} height={7} rx={1.5} />
      <Rect x={3} y={14} width={7} height={7} rx={1.5} />
      <Path d="M14 14h3v3h-3zM17 20h4v-3" />
    </Svg>
  );
}

// Completeness ring around the main photo (App v2, issue 58).
function Ring({ pct, c }: { pct: number; c: string }) {
  const r = 43;
  const len = 2 * Math.PI * r;
  return (
    <Svg width={92} height={92} viewBox="0 0 92 92">
      <Circle cx={46} cy={46} r={r} stroke={color.line} strokeWidth={5} fill="none" />
      <Circle cx={46} cy={46} r={r} stroke={c} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={`${(len * Math.max(0, Math.min(100, pct))) / 100} ${len}`} transform="rotate(-90 46 46)" />
    </Svg>
  );
}

// I-02 share link as a QR, from the Me header (#102). Creating the link is the same as in Edit profile.
function QrSheet({ visible, profileId, onClose }: { visible: boolean; profileId: string; onClose: () => void }) {
  const [share, setShare] = useState<{ url: string } | null | undefined>(undefined);
  const load = useCallback(() => api<{ share: { url: string } | null }>('GET', `/me/profiles/${profileId}/share`).then((r) => setShare(r.share), () => setShare(null)), [profileId]);
  useEffect(() => {
    if (visible) load();
  }, [visible, load]);
  return (
    <Sheet visible={visible} onClose={onClose} title={tx.share.title} closeLabel={tx.common.close}>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.share.hint}</Text>
      {share ? (
        <View style={{ alignItems: 'center', gap: space.m }}>
          <Qr value={share.url} size={200} />
          <Button title={tx.share.send} onPress={() => Share.share({ message: share.url }).catch(() => {})} />
        </View>
      ) : share === null ? (
        <Button kind="secondary" title={tx.share.create} onPress={() => api('POST', `/me/profiles/${profileId}/share`).then(load, () => {})} />
      ) : null}
    </Sheet>
  );
}
