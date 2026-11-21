import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Image, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import type { Mode, MyProfile, ProfileView, Visibility } from '../api/types';
import { useSession } from '../app/session';
import { distanceLabel, tx } from '../i18n/app';
import { TravelReason } from '../travel/travel';
import { rememberTrip } from '../travel/peerTrips';
import { color, font, modeColor, radius, space, type } from '../theme/tokens';
import { v3 } from '../i18n/v3';
import { AUDIENCES, allowedFor, cycle } from '../me/look';
import { afterSheet, useNavSpace, Badge, Banner, Button, ErrorState, Icon, Loading, Photo, Scrim, useAccent, VerifiedTick } from '../ui';
import { getLocal } from '../me/localFields';
import { FieldList } from './FieldList';
import { PrivateNote } from './PrivateNote';
import { convWith, dropFriend, answerFriend, getConvs, requestFriend } from '../chat/engine';
import * as People from '../chat/people';
import { ppl } from '../i18n/people';
import { LENSES, lensFields, lensPhoto } from './lens';
import { SafetySheet, SheetRow } from '../trust/SafetySheet';
import { setToastLift, toast } from '../ui/Toast';
import { GestureDetector, useCompetingGestures, useExclusiveGestures, usePanGesture, usePinchGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { gx } from '../i18n/gestures';
import { commits, nextIndex, photoZone, rubber } from '../ui/gestureMath';
import { feel } from '../ui/haptics';
import { settle } from '../ui/motion';
import { PhotoViewer } from '../ui/PhotoViewer';

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void; setParams?: (p: Partial<Params>) => void };
type Params = { id: string; preview?: 'stranger' | 'verified' | 'chats'; mode?: Mode; /** F-19 G10: grid order around this profile. */ ids?: string[]; /** F-20: opened while looking around this trip city */ trip?: string };

/** Preview-as (R-06.7): own profile filtered the way the chosen audience sees it through a lens. */
export function previewOf(p: MyProfile, as: 'stranger' | 'verified' | 'chats', local: Record<string, unknown>, verified: boolean, mode: Mode = 'hookup'): ProfileView {
  const allowed: Visibility[] = allowedFor(as);
  const all = { ...p.fields, ...(as === 'chats' ? local : {}) };
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    const vis = p.visibility_map[k] ?? 'public';
    if (allowed.includes(vis)) fields[k] = v;
  }
  const shown = lensFields(fields, mode);
  return {
    id: p.id,
    kind: p.kind,
    display_name: p.display_name,
    age: p.age,
    gender: p.gender,
    gender_other: p.gender_other,
    fields: shown,
    photos: p.photos.filter((x) => x.url && x.status !== 'rejected' && lensPhoto(x, mode)).map((x) => x.url!),
    verified,
    verified_since: null,
    member_since: new Date().toISOString(),
    now: null,
    distance: null,
    tapped: false,
    tapped_me: false,
    vouches: 0,
    badges: [],
    linked_accounts: [],
    self: true,
  };
}

// S-20 profile view (F-06). R-04.9: blocked / unavailable → "Not available".
export function ProfileScreen({ route, navigation }: { route: { params: Params }; navigation: Nav }) {
  const { id, preview } = route.params;
  const p0self = !!preview;
  const { me, mode: appMode } = useSession();
  // F-06 R-06.1b: others are seen through the current mode's lens.
  const mode = route.params.mode ?? appMode;
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  // #137: the action bar sits right above the app nav bar.
  const { bottom: navBottom } = useNavSpace();
  useEffect(() => {
    if (p0self) return;
    setToastLift(58 + space.s);
    return () => setToastLift(0);
  }, [p0self]);
  People.usePeople();
  const [remote, setP] = useState<ProfileView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const width = Math.min(Dimensions.get('window').width, 560);
  // Photo shown, per profile (G10 swaps the profile in place, so a new one starts at its first photo).
  const [pg, setPg] = useState({ id, page: 0 });
  const page = pg.id === id ? pg.page : 0;
  const setPage = useCallback((n: number) => setPg({ id, page: n }), [id]);
  const [viewer, setViewer] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [solid, setSolid] = useState(false);

  const [nowTs] = useState(() => Date.now());
  const [local, setLocal] = useState<Record<string, unknown>>({});
  const own = preview ? (me.profiles ?? []).find((x) => x.id === id) : undefined;
  const previewView = useMemo(() => (own && preview ? previewOf(own, preview, local, me.verified, mode) : null), [own, preview, local, me.verified, mode]);

  const load = useCallback(
    () =>
      preview
        ? getLocal(id).then(setLocal)
        : api<ProfileView>('GET', `/profiles/${id}?mode=${mode}${route.params.trip ? `&trip_id=${route.params.trip}` : ''}`).then(
            (v) => {
              setErr(null);
              setP(v);
              if (!route.params.trip) rememberTrip(v.id, v.trip);
            },
            (e) => {
              if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setGone(true);
              else setErr(e instanceof ApiError ? e.message : tx.common.error);
            },
          ),
    [id, preview, mode, route.params.trip],
  );

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      after?.();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : tx.common.error);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- F-19 G9–G12 gestures
  const cur = previewView ?? (remote?.id === id ? remote : null);
  const pics = useMemo(() => cur?.photos ?? [], [cur]);
  const reduce = useReducedMotion();
  const ids = useMemo(() => route.params.ids ?? [], [route.params.ids]);
  const at = ids.indexOf(id);
  const canGo = (d: -1 | 1) => at >= 0 && nextIndex(at, ids.length, d) !== at;
  useEffect(() => {
    // Next photo ready before it is asked for.
    const nx = pics[page + 1];
    if (nx) Image.prefetch(nx).catch(() => {});
  }, [pics, page]);

  // G9: tap the photo's left side = previous, elsewhere = next.
  const flip = (d: -1 | 1) => {
    const k = page + d;
    if (k < 0 || k >= pics.length) return;
    feel('tick');
    setPage(k);
  };
  // G10: next / previous profile in grid order, swapped in place.
  const goProfile = (d: -1 | 1) => {
    if (at < 0) return;
    const k = nextIndex(at, ids.length, d);
    if (k === at) return;
    feel('tick');
    navigation.setParams?.({ id: ids[k] });
  };
  // G11: double-tap sends a Tap once; never takes it back.
  const tapNow = () => {
    if (!cur || cur.self || preview || cur.tapped) return;
    feel('success');
    act(() => api('POST', `/profiles/${cur.id}/tap`), () => {
      setP({ ...cur, tapped: true });
      toast(gx.tapSent);
    });
  };

  const W = width;
  const swipeX = useSharedValue(0);
  const closeY = useSharedValue(0);
  const burst = useSharedValue(0);
  const bx = useSharedValue(0);
  const by = useSharedValue(0);
  const zoom = useSharedValue(1);
  const n = ids.length;
  const profileSwipe = usePanGesture({
    enabled: n > 1 && !preview,
    activeOffsetX: [-16, 16],
    failOffsetY: [-12, 12],
    hitSlop: { left: -24 },
    onUpdate: (e) => {
      'worklet';
      const t = e.translationX;
      const edge = (t > 0 && at <= 0) || (t < 0 && at >= n - 1);
      swipeX.set(edge ? rubber(t, 40) : t * 0.6);
    },
    onDeactivate: (e) => {
      'worklet';
      const t = swipeX.get();
      const d = t < 0 ? 1 : -1;
      const edge = (d === 1 && at >= n - 1) || (d === -1 && at <= 0);
      if (!edge && commits(e.translationX, e.velocityX, W, 0.3)) {
        swipeX.set(withTiming(-d * W * 0.6, { duration: 140 }, (done) => {
          if (!done) return;
          swipeX.set(d * W * 0.4);
          scheduleOnRN(goProfile, d);
          swipeX.set(settle(0, reduce));
        }));
      } else swipeX.set(settle(0, reduce));
    },
  });
  const single = useTapGesture({
    onActivate: (e) => {
      'worklet';
      scheduleOnRN(flip, photoZone(e.x, W));
    },
  });
  const double = useTapGesture({
    numberOfTaps: 2,
    maxDelay: 250,
    onActivate: (e) => {
      'worklet';
      bx.set(e.x);
      by.set(e.y);
      burst.set(withSequence(withTiming(1, { duration: 180 }), withTiming(1, { duration: 450 }), withTiming(0, { duration: 220 })));
      scheduleOnRN(tapNow);
    },
  });
  const openViewer = useCallback(() => setViewer(true), []);
  const pinchOpen = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      zoom.set(Math.max(1, Math.min(1.3, e.scale)));
    },
    onDeactivate: (e) => {
      'worklet';
      zoom.set(settle(1, reduce));
      if (e.scale > 1.15) scheduleOnRN(openViewer);
    },
  });
  const close = useCallback(() => navigation.goBack(), [navigation]);
  const pullClose = usePanGesture({
    enabled: atTop,
    activeOffsetY: 10,
    failOffsetX: [-14, 14],
    onUpdate: (e) => {
      'worklet';
      closeY.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (commits(closeY.get(), e.velocityY, 400, 0.3)) {
        scheduleOnRN(close);
      } else closeY.set(settle(0, reduce));
    },
  });
  const taps = useExclusiveGestures(double, single);
  const photoGesture = useCompetingGestures(pullClose, pinchOpen, taps);
  const screenStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: closeY.get() * 0.8 }, { scale: 1 - Math.min(0.12, closeY.get() / 1600) }],
    borderRadius: closeY.get() > 0 ? 28 : 0,
  }));
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateX: swipeX.get() }], opacity: 1 - Math.min(0.5, Math.abs(swipeX.get()) / W) }));
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.get() }] }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.get(), left: bx.get() - 44, top: by.get() - 44, transform: [{ scale: 0.4 + burst.get() * 0.8 }, { translateY: (1 - burst.get()) * 10 }] }));

  if (gone)
    return (
      <View style={{ flex: 1, backgroundColor: color.bgBase, justifyContent: 'center', alignItems: 'center', gap: space.l }}>
        <Text style={{ ...type.title, color: color.fgPrimary }}>{tx.profile.unavailable}</Text>
        <Button kind="secondary" title={tx.common.back} onPress={navigation.goBack} />
      </View>
    );
  if (err) return <ErrorState text={err} retry={tx.common.retry} onRetry={load} />;
  const p = cur;
  if (!p) return <Loading />;

  const photos = p.photos.length ? p.photos : [null];
  // #115: favorite (private) and friends (R-07.36, only once a chat exists).
  const fav = People.isFav(p.id);
  const fstate = People.friendOf(p.id);
  const chat = convWith(p.id);
  const friendRows: { label: string; icon: typeof Icon.UserPlus; tint: string; on: () => void; danger?: boolean }[] =
    p.self || !chat || (!chat.iWrote && !chat.theyWrote)
      ? []
      : fstate === 'in'
        ? [{ label: ppl.acceptFriend, icon: Icon.UserPlus, tint: color.friends, on: () => { setMenu(false); answerFriend(chat.id, true); } }]
        : fstate
          ? [{ label: fstate === 'out' ? ppl.cancelRequest : ppl.removeFriend, icon: Icon.UserPlus, tint: color.friends, on: () => { setMenu(false); dropFriend(chat.id); } }]
          : People.canAsk(p.id) && me.verified
            ? [{ label: ppl.addFriend, icon: Icon.UserPlus, tint: color.friends, on: () => { setMenu(false); requestFriend(chat.id); } }]
            : [];
  const years = Math.floor((nowTs - new Date(p.member_since).getTime()) / (365.25 * 86400000));

  return (
    <GestureDetector gesture={profileSwipe}>
    <Animated.View style={[{ flex: 1, backgroundColor: color.bgBase, overflow: 'hidden' }, screenStyle]}>
      <Animated.View style={[{ flex: 1 }, bodyStyle]}>
      <ScrollView
        // #124: clear the floating action bar (58) + its inset + breathing room, on every phone.
        contentContainerStyle={{ paddingBottom: p.self ? navBottom + space.xxl : navBottom + space.s + 58 + space.xxl }}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const past = y > width * 1.33 - 140;
          if (past !== solid) setSolid(past);
          if (y <= 0 !== atTop) setAtTop(y <= 0);
        }}
      >
        <View>
          {/* F-19: tap sides = photos (G9), double-tap = Tap (G11), pinch = full screen (G13), pull down = close (G12). */}
          <GestureDetector gesture={photoGesture}>
            <Animated.View
              testID="profile-photo"
              style={[{ width, height: width * 1.33 }, zoomStyle]}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${p.display_name}: ${gx.photoOf(page + 1, photos.length)}`}
              accessibilityActions={[
                ...(page < photos.length - 1 ? [{ name: 'next', label: gx.nextPhoto }] : []),
                ...(page > 0 ? [{ name: 'prev', label: gx.prevPhoto }] : []),
                ...(p.photos.length ? [{ name: 'open', label: gx.openPhoto }] : []),
                ...(!p.self && !preview && !p.tapped ? [{ name: 'tap', label: tx.profile.tap }] : []),
              ]}
              onAccessibilityAction={(e) => {
                const a = e.nativeEvent.actionName;
                if (a === 'next') flip(1);
                else if (a === 'prev') flip(-1);
                else if (a === 'open') setViewer(true);
                else if (a === 'tap') tapNow();
              }}
            >
              <Photo uri={photos[page]} id={p.id + page} label="" style={{ width, height: width * 1.33 }} />
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 88, height: 88, borderRadius: 44, backgroundColor: color.hookup, alignItems: 'center', justifyContent: 'center' }, burstStyle]}>
                <Icon.Flame size={30} c={color.onAccent} fill={color.onAccent} />
                <Text style={{ ...type.caption, fontFamily: font.heavy, color: color.onAccent }}>{tx.profile.tap.toUpperCase()}</Text>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
          <Scrim height={160} max={1} steps={12} />
          {photos.length > 1 ? (
            <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 4, left: space.l, right: space.l, flexDirection: 'row', gap: 4 }}>
              {photos.map((_, i) => (
                // G9 visible alternative: each bar opens its photo.
                <Pressable key={i} accessibilityRole="button" accessibilityLabel={gx.photoOf(i + 1, photos.length)} onPress={() => setPage(i)} hitSlop={{ top: 8, bottom: 12 }} style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: color.fgPrimary, opacity: i === page ? 1 : 0.35 }} />
              ))}
            </View>
          ) : null}
        </View>
        <View style={{ marginTop: -64, paddingHorizontal: space.xl, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
          {preview ? (
            // #114 full-screen preview: "Seen by <viewer> in <lens>", each pill cycles.
            <View testID="preview-pills" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 4, paddingLeft: 12, borderRadius: radius.pill, backgroundColor: color.scrim }}>
              <Text style={{ ...type.meta, color: color.fgSecondary }}>{v3.look.seenBy}</Text>
              <Pressable testID="preview-aud" accessibilityRole="button" onPress={() => navigation.setParams?.({ preview: cycle(AUDIENCES, preview) })} style={{ height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.bgInverse, justifyContent: 'center' }}>
                <Text style={{ ...type.meta, fontFamily: font.heavy, color: color.onAccent }}>{v3.look.aud[preview]} ▾</Text>
              </Pressable>
              <Text style={{ ...type.meta, color: color.fgSecondary }}>{v3.look.in}</Text>
              <Pressable testID="preview-lens" accessibilityRole="button" onPress={() => navigation.setParams?.({ mode: cycle(LENSES, mode) })} style={{ height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: modeColor[mode], justifyContent: 'center' }}>
                <Text style={{ ...type.meta, fontFamily: font.heavy, color: color.onAccent }}>{tx.modes[mode]} ▾</Text>
              </Pressable>
            </View>
          ) : null}
          {preview && own && !(own.show_in ?? ['hookup']).includes(mode) ? <Banner tone="warn" text={v3.look.off(tx.modes[mode])} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <Text style={{ ...type.display, fontSize: 34, lineHeight: 38, color: color.fgPrimary, flexShrink: 1 }} accessibilityRole="header">
              {p.display_name}, {p.age}
            </Text>
            {p.verified ? <VerifiedTick size={24} /> : null}
          </View>
          {/* F-20 R-20.7: a visitor's distance is replaced by the reason he shows up here */}
          {p.trip ? <TravelReason trip={p.trip} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {p.distance ? <Chip text={distanceLabel(p.distance)} fg={color.trust} /> : null}
            {p.fields.pronouns ? <Chip text={String(p.fields.pronouns)} /> : null}
            <Chip text={tx.profile.memberSince(years)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {p.now ? <Badge label={tx.now[p.now.status] + (p.now.text ? ` · ${p.now.text}` : '')} fill={accent} /> : null}
            {p.tapped_me ? <Badge label={tx.profile.tappedYou} fill={color.personal} /> : null}
            {p.verified_since ? <Badge label={tx.profile.verifiedSince(new Date(p.verified_since).toLocaleDateString())} fill={color.trust} /> : null}
            {p.vouches > 0 ? <Badge label={tx.profile.vouches(p.vouches)} fill={color.friends} /> : null}
            {p.badges
              .filter((b) => b.kind === 'host_rating')
              .map((b) => (
                <Badge key={b.kind} label={tx.profile.hostRating(b.up_pct ?? 0, b.total ?? 0)} fill={color.hookup} />
              ))}
          </View>
          {p.linked_accounts.length ? (
            <View testID="profile-linked" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {p.linked_accounts.map((l) => (
                <Pressable key={l.platform + l.handle} accessibilityRole="link" onPress={() => l.url && Linking.openURL(l.url)}>
                  <Badge label={`${tx.linked.platforms[l.platform] ?? l.platform} @${l.handle}${l.verified ? ` · ${tx.profile.linkedVerified}` : ''}`} fill={color.fgSoft} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {p.tapped && p.tapped_me ? <Banner tone="personal" text={tx.profile.mutual} /> : null}
          <FieldList fields={{ ...p.fields, ...(getConvs().find((c) => c.peer === p.id)?.peerFields ?? {}) }} accent={accent} />
          {!p.self && !preview ? <PrivateNote profileId={p.id} /> : null}
        </View>
      </ScrollView>
      </Animated.View>

      {solid ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 76, backgroundColor: color.bgBase, borderBottomWidth: 1, borderBottomColor: color.line, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 26 }}>
          <Text numberOfLines={1} style={{ ...type.headline, color: color.fgPrimary, maxWidth: '60%' }}>
            {p.display_name}, {p.age}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tx.common.back}
        onPress={navigation.goBack}
        style={{ position: 'absolute', top: insets.top + 16, left: space.l, width: 44, height: 44, borderRadius: 22, backgroundColor: color.bgInverse, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon.Back c={color.onAccent} />
      </Pressable>
      {n > 1 && !preview ? (
        // G10 visible alternative: previous / next profile in grid order.
        <View style={{ position: 'absolute', top: insets.top + 16, right: space.l + (p.self ? 0 : 44 + space.s), flexDirection: 'row', height: 44, borderRadius: 22, backgroundColor: color.bgInverse, overflow: 'hidden' }}>
          <Pressable testID="profile-prev" accessibilityRole="button" accessibilityLabel={gx.prevProfile} accessibilityState={{ disabled: !canGo(-1) }} onPress={() => goProfile(-1)} style={{ width: 40, alignItems: 'center', justifyContent: 'center', opacity: canGo(-1) ? 1 : 0.3 }}>
            <Icon.Back c={color.onAccent} size={20} />
          </Pressable>
          <Pressable testID="profile-next" accessibilityRole="button" accessibilityLabel={gx.nextProfile} accessibilityState={{ disabled: !canGo(1) }} onPress={() => goProfile(1)} style={{ width: 40, alignItems: 'center', justifyContent: 'center', opacity: canGo(1) ? 1 : 0.3 }}>
            <Icon.Chevron c={color.onAccent} size={20} d="M9 6l6 6-6 6" />
          </Pressable>
        </View>
      ) : null}
      {p.photos.length && !solid ? (
        // G13 visible alternative: open the photos full screen.
        <Pressable testID="profile-expand" accessibilityRole="button" accessibilityLabel={gx.openPhoto} onPress={() => setViewer(true)} style={{ position: 'absolute', top: insets.top + 16 + 44 + space.s, right: space.l, width: 44, height: 44, borderRadius: 22, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' }}>
          <Icon.Expand />
        </Pressable>
      ) : null}
      {!p.self ? (
        <Pressable
          testID="profile-menu"
          accessibilityRole="button"
          accessibilityLabel={tx.profile.menu}
          onPress={() => setMenu(true)}
          style={{ position: 'absolute', top: insets.top + 16, right: space.l, width: 44, height: 44, borderRadius: 22, backgroundColor: color.bgInverse, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon.More c={color.onAccent} />
        </Pressable>
      ) : null}

      {/* #124: content fades out under the action bar instead of showing between the buttons. */}
      {!p.self ? <Scrim height={navBottom + space.s + 58 + space.xxl} max={1} steps={10} /> : null}
      {!p.self ? (
        <View style={{ position: 'absolute', left: space.l, right: space.l, bottom: navBottom + space.s, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            testID="tap-btn"
            accessibilityRole="button"
            accessibilityLabel={p.tapped ? tx.profile.tapped : tx.profile.tap}
            accessibilityState={{ disabled: p.tapped, busy }}
            onPress={p.tapped || busy ? undefined : () => act(() => api('POST', `/profiles/${p.id}/tap`), () => setP({ ...p, tapped: true }))}
            style={({ pressed }) => [{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: p.tapped ? color.hookup : color.bgRaised }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <Icon.Flame c={p.tapped ? color.onAccent : color.fgPrimary} fill={p.tapped ? color.onAccent : 'none'} />
          </Pressable>
          <Pressable
            testID="fav-btn"
            accessibilityRole="button"
            accessibilityLabel={fav ? ppl.removeFav : ppl.addFav}
            accessibilityState={{ selected: fav }}
            onPress={() => People.setFav(p.id, !fav, { name: p.display_name, photo: p.photos[0] ?? null })}
            style={({ pressed }) => [{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: fav ? color.personal : color.bgRaised }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <Icon.Star c={fav ? color.onAccent : color.fgPrimary} fill={fav ? color.onAccent : 'none'} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Button
              testID="message-btn"
              title={tx.profile.message}
              fill={accent}
              onPress={() =>
                me.verified
                  ? navigation.navigate('Chat', { profileId: p.id, name: p.display_name })
                  : // #124: solid toast above the bar instead of a see-through banner floating over the content.
                    toast(tx.explore.unverifiedMessage, { label: tx.me.verifyNow, on: () => navigation.navigate('Verify') })
              }
            />
          </View>
        </View>
      ) : null}

      <SafetySheet
        visible={menu}
        target={{ id: p.id, name: p.display_name, age: p.age }}
        onClose={() => setMenu(false)}
        onReport={(t) => navigation.navigate('Report', { profileId: t.id })}
        onGone={() => navigation.goBack()}
      >
        {friendRows.map((r) => (
          <SheetRow key={r.label} testID="profile-friend" title={r.label} onPress={r.on} />
        ))}
        <SheetRow title={tx.profile.share} onPress={() => {
            // #124: close the sheet first; the system share sheet opens once it is gone.
            setMenu(false);
            afterSheet(() => Share.share({ message: `https://thirstr.fun/p/${p.id}` }).catch(() => {}));
          }} last={!(p.vouched || p.can_vouch)} />
        {p.vouched || p.can_vouch ? (
          <SheetRow last title={p.vouched ? tx.profile.unvouch : tx.profile.vouch} onPress={() => act(() => api(p.vouched ? 'DELETE' : 'POST', `/profiles/${p.id}/vouch`), () => { setMenu(false); load(); })} />
        ) : null}
      </SafetySheet>
      <PhotoViewer items={viewer ? p.photos : null} index={page} src={(u: string) => u} onClose={() => setViewer(false)} />
    </Animated.View>
    </GestureDetector>
  );
}

function Chip({ text, fg = color.fgSecondary }: { text: string; fg?: string }) {
  return (
    <View style={{ paddingHorizontal: space.m, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: color.bgRaised }}>
      <Text style={{ ...type.meta, fontFamily: type.headline.fontFamily, color: fg }}>{text}</Text>
    </View>
  );
}
