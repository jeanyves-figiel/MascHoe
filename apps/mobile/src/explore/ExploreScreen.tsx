import AsyncStorage from '@react-native-async-storage/async-storage';
import { cellToLatLng } from 'h3-js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { FlatList, Platform, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import type { Card, ExploreSummary, MapData, Mode, Place } from '../api/types';
import { useSession } from '../app/session';
import { distanceLabel, tx } from '../i18n/app';
import { mod } from '../i18n/mod';
import { prefs } from '../me/prefs';
import { SafetySheet, SheetRow } from '../trust/SafetySheet';
import { toast } from '../ui/Toast';
import { color, radius, space, type } from '../theme/tokens';
import { Banner, EmptyState, ErrorState, Icon, Loading, Photo, useAccent, VerifiedTick } from '../ui';
import { ProfileTile } from './Card';
import { activeFilterCount, defaultFilters, Filters, filterMode, restoreFilters, loadGrid, loadMap, loadPlaces, loadSummary, loadTray } from './explore';
import { LiveHeader, VerifyRow } from './LiveHeader';
import { ExploreMap } from './ExploreMap';
import { GridSheet, Snap, snapHeight } from './GridSheet';
import { activeKinds, defaultLayers, fitCamera, INTENTS, isNear, Layers, PlaceKind, placeKind, restoreIntents, restoreLayers, toggleIntent, toggleLayer } from './mapShared';
import { PlaceCard, PlaceChips } from './Places';
import { NowSheet } from '../me/NowSheet';
import { FiltersSheet } from './FiltersSheet';
import { devicePosition, lastKnown, LatLng, locateDevice, onDevicePosition, syncLocation } from './location';
import { LocationSheet } from './LocationSheet';

const FILTER_KEY = (m: string) => 'thirstr.filters.' + m;
// #113: one filter set for the merged map; chips and place layers saved on the device.
const MERGED_FILTERS = 'thirstr.filters.explore';
const INTENTS_KEY = 'thirstr.exploreIntents';
const LAYERS_KEY = 'thirstr.exploreLayers';
const SNAP_KEY = 'thirstr.exploreSnap';
const HOLD_KEY = 'thirstr.holdHintSeen';
/** Floating tab bar (16 pt inset + 64 pt + 18 pt) the sheet content must clear. */
const TAB_SPACE = 96;

// S-10 / S-11 Explore (F-04). AC-04.1: cold start → profile → Message in ≤ 3 taps.
export function ExploreScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { me, setMe, mode, setMode, refresh } = useSession();
  // RF-5: no main photo yet = invisible; nudge before the verify banner.
  const hasMain = !!me.profile?.photos.some((x) => x.slot === 0 && x.status === 'ok_main');
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const [snap, setSnap] = useState<Snap>('half');
  const [selected, setSelected] = useState<string | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [screen, setScreen] = useState<{ w: number; h: number } | null>(null);
  const [headerH, setHeaderH] = useState(0);
  const [intents, setIntents] = useState<Mode[]>(() => (INTENTS.includes(mode) ? [...INTENTS] : ['hookup']));
  const [layers, setLayers] = useState<Layers>(defaultLayers);
  const [places, setPlaces] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [fitM, setFitM] = useState<number | null>(null);
  const [plans, setPlans] = useState(0);
  const [showNow, setShowNow] = useState(false);
  const list = useRef<FlatList<Card>>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [items, setItems] = useState<Card[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [furtherFrom, setFurtherFrom] = useState<number | null>(null);
  const [tray, setTray] = useState<Card[]>([]);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [summary, setSummary] = useState<ExploreSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [quick, setQuick] = useState<Card | null>(null);
  // #111 map peek card: the selected pin's card (first tap), with ⋯ for Hide / Block / Report.
  const [peek, setPeek] = useState<Card | null>(null);
  const [holdSeen, setHoldSeen] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(HOLD_KEY).then((v) => setHoldSeen(v === '1'), () => {});
  }, []);
  const hold = useCallback((c: Card) => {
    if (Platform.OS !== 'web' && prefs().haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setQuick(c);
    setHoldSeen(true);
    AsyncStorage.setItem(HOLD_KEY, '1');
  }, []);
  const bbox = useRef<[number, number, number, number] | null>(null);
  const [locTick, setLocTick] = useState(0);
  const [device, setDevice] = useState<LatLng | null>(devicePosition());
  const [recenter, setRecenter] = useState(0);

  useEffect(() => onDevicePosition(setDevice), []);

  useEffect(() => {
    AsyncStorage.getItem(SNAP_KEY).then((v) => (v === 'peek' || v === 'half' || v === 'full') && setSnap(v));
  }, []);

  // R-04.18: chips + place layers saved on the device; one filter set (falls back to the old Hookup set).
  useEffect(() => {
    AsyncStorage.getItem(INTENTS_KEY).then((v) => setIntents(restoreIntents(v)));
    AsyncStorage.getItem(LAYERS_KEY).then((v) => setLayers(restoreLayers(v)));
    AsyncStorage.getItem(MERGED_FILTERS)
      .then((f) => f ?? AsyncStorage.getItem(FILTER_KEY('hookup')))
      .then((f) => setFilters(restoreFilters(f)));
  }, []);
  // App mode (accent, tab bar, other tabs) follows the first chip.
  useEffect(() => {
    if (intents[0] && intents[0] !== mode) setMode(intents[0]);
  }, [intents, mode, setMode]);
  const onIntent = useCallback((m: Mode) => {
    setIntents((cur) => {
      const next = toggleIntent(cur, m);
      AsyncStorage.setItem(INTENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const safe = me.safe_mode === 'on' || !!me.safe_mode_active;
  const kinds = useMemo(() => (safe ? [] : activeKinds(layers, intents)), [safe, layers, intents]);
  const onLayer = useCallback(
    (k: PlaceKind) =>
      setLayers((cur) => {
        const next = toggleLayer(cur, k, intents);
        AsyncStorage.setItem(LAYERS_KEY, JSON.stringify(next));
        return next;
      }),
    [intents],
  );

  // Location refresh on open (R-05.8).
  useEffect(() => {
    const sync = () =>
      syncLocation(me)
        .then((m) => {
          if (!m) return;
          setMe(m);
          setLocTick((t) => t + 1);
        })
        .catch(() => {});
    // R-04.13: ask once + get the device fix first, so the map can centre on it.
    locateDevice()
      .catch(() => null)
      .then(sync);
    const id = setInterval(sync, 5 * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.location?.level]);

  // R-04.17: header counts; failure keeps the "·" placeholder, never a made-up number.
  const reloadSummary = useCallback(() => {
    loadSummary(intents, filters)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [intents, filters]);

  const reload = useCallback(
    () =>
      Promise.all([loadGrid(intents, filters), loadTray(intents, filters), bbox.current ? loadMap(intents, filters, bbox.current) : Promise.resolve(null)]).then(
        ([g, t, m]) => {
          setErr(null);
          setItems(g.items);
          setNext(g.next);
          setFurtherFrom(g.further_from);
          setFitM(g.fit_m ?? null);
          setTray(t.items);
          if (m) setMapData(m);
        },
        (e) => setErr(e instanceof ApiError ? e.message : tx.common.error),
      ),
    [intents, filters],
  );

  useEffect(() => {
    reload();
  }, [reload, me.location?.level, locTick]);

  useEffect(() => {
    reloadSummary();
  }, [reloadSummary, me.location?.level, locTick, me.now]);

  // R-04.20: places for the viewport, from our own API only.
  const reloadPlaces = useCallback(() => {
    const b = bbox.current;
    if (!b) return;
    loadPlaces(kinds, b)
      .then((r) => setPlaces(r.places))
      .catch(() => {});
  }, [kinds]);
  useEffect(() => {
    reloadPlaces();
  }, [reloadPlaces]);
  const onRegion = useCallback(
    (b: [number, number, number, number]) => {
      bbox.current = b;
      loadMap(intents, filters, b)
        .then(setMapData)
        .catch(() => {});
      reloadPlaces();
    },
    [intents, filters, reloadPlaces],
  );
  const shownPlaces = places.filter((p) => kinds.includes(placeKind(p)));

  async function more() {
    if (!next) return;
    const g = await loadGrid(intents, filters, next);
    setItems((cur) => [...(cur ?? []), ...g.items]);
    setNext(g.next);
  }

  // R-04.18: open in the card's lens = his first intent among the chips.
  const open = useCallback(
    (c: Card) =>
      navigation.navigate('Profile', {
        id: c.id,
        mode: intents.find((m) => (c.intents ?? ['hookup']).includes(m)) ?? intents[0],
      }),
    [navigation, intents],
  );
  // R-04.14: first tap on a pin selects it (tile highlighted), a tap on the selected pin opens the profile.
  const selectPin = useCallback(
    (c: Card) => {
      if (selected === c.id) return open(c);
      setPlace(null);
      setSelected(c.id);
      setPeek(c);
      setSnap((cur) => (cur === 'peek' ? 'half' : cur));
    },
    [selected, open],
  );
  const changeSnap = useCallback((v: Snap) => {
    setSnap(v);
    AsyncStorage.setItem(SNAP_KEY, v);
  }, []);
  useEffect(() => {
    const i = selected && items ? items.findIndex((c) => c.id === selected) : -1;
    if (i >= 0)
      list.current?.scrollToIndex({
        index: Math.floor(i / 3),
        animated: true,
        viewPosition: 0.2,
      });
  }, [selected, items]);
  // R-04.1: the viewer isn't shown in this mode → one tap turns it on (Sport opens its fields).
  const own = me.profile ?? me.profiles?.[0];
  // R-04.18: not shown under any selected chip → one tap adds the first one.
  const notShown = !!own && !intents.some((m) => (own.show_in ?? ['hookup']).includes(m));
  const showMe = useCallback(async () => {
    if (!own) return;
    const order = ['hookup', 'friends', 'sport'] as const;
    const next = order.filter((m) => m === mode || (own.show_in ?? []).includes(m));
    try {
      await api('PATCH', `/me/profiles/${own.id}`, { show_in: next });
      await refresh();
      const sports = own.fields.sports;
      if (mode === 'sport' && !(Array.isArray(sports) && sports.length)) navigation.navigate('EditProfile', { id: own.id, focus: 'sport' });
    } catch {
      // Stays visible; the banner remains so they can retry.
    }
  }, [own, mode, refresh, navigation]);

  // R-04.13: own device position first (any level, incl. Hidden/City), then pin, last area cell, own coarse cell.
  const dot: LatLng | null = (() => {
    if (device) return device;
    const pin = me.location?.pin;
    if (pin) return { lat: pin.lat, lng: pin.lng };
    const lk = lastKnown();
    if (lk) {
      const [lat, lng] = cellToLatLng(lk.cell);
      return { lat, lng };
    }
    return null;
  })();
  const center: { lat: number; lng: number; zoom?: number } | null = (() => {
    if (dot) return dot;
    const r5 = me.location?.cell_r5;
    if (r5) {
      const [lat, lng] = cellToLatLng(r5);
      return { lat, lng };
    }
    return null;
  })();

  // R-04.15: zoom to fit the nearest people above the sheet.
  const sheetPx = box ? snapHeight(snap, box.h, TAB_SPACE) : 0;
  const camera = center && box && screen ? fitCamera(center, fitM, screen.w, screen.h, Math.min(sheetPx, box.h * 0.6), headerH) : center;
  const quiet = !!items && items.length > 0 && !items.some((c) => isNear(c.distance));
  useEffect(() => {
    if (!quiet) return;
    api<{ plans: unknown[] }>('GET', `/tonight?mode=${intents[0]}`)
      .then((r) => setPlans(r.plans?.length ?? 0))
      .catch(() => setPlans(0));
  }, [quiet, intents]);

  async function locateMe() {
    const p = await locateDevice().catch(() => null);
    if (!p && !center) return setShowLocation(true);
    setRecenter((n) => n + 1);
  }

  const iconBtn = {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.bgRaised,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  // App v2 header (design-system.md › App v2 rules): wordmark + location chip + filters; mode switch (no Map/Grid toggle, #100).
  // R-04.17 live header (#104): place + counts + mode tiles. Verify nudge moved into the sheet.
  const banner = !hasMain ? (
    <Banner testID="photo-banner" tone="warn" text={tx.explore.photoBanner} onPress={() => navigation.navigate('EditProfile')} />
  ) : notShown ? (
    <Banner testID="lens-banner" tone="warn" text={tx.explore.notShownIn(tx.modes[intents[0]])} onPress={showMe} />
  ) : safe ? (
    <Banner tone="personal" text={tx.explore.safeMode} />
  ) : null;
  const header = (
    <LiveHeader
      me={me}
      intents={intents}
      onIntent={onIntent}
      summary={summary}
      filtersOn={activeFilterCount(filters)}
      topInset={insets.top}
      onFilters={() => setShowFilters(true)}
      onLocation={() => setShowLocation(true)}
      onNow={() => (me.verified ? setShowNow(true) : navigation.navigate('Verify'))}
      banner={banner}
    />
  );

  const card = (icon: React.ReactNode, title: string, sub: string, action: string | null, onPress: () => void, testID: string, tint: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.m,
          padding: 14,
          borderRadius: radius.tray,
          backgroundColor: color.bgRaised,
          marginBottom: space.l,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: tint + '29',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.headline, color: color.fgPrimary }}>{title}</Text>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>{sub}</Text>
      </View>
      {action ? (
        <View
          style={{
            height: 40,
            paddingHorizontal: space.l,
            borderRadius: radius.pill,
            backgroundColor: accent,
            justifyContent: 'center',
          }}
        >
          <Text style={{ ...type.headline, fontSize: 14, color: color.onAccent }}>{action}</Text>
        </View>
      ) : (
        <Icon.Next />
      )}
    </Pressable>
  );
  const postNow = () => (me.verified ? setShowNow(true) : navigation.navigate('Verify'));
  const beFirst = card(<Icon.Bolt c={accent} />, tx.explore.beFirst, tx.explore.beFirstBody, tx.explore.post, postNow, 'post-now', accent);

  // R-04.16: quiet area / unverified / nobody. Never invented counts.
  const listHead =
    items && items.length === 0 ? (
      <View>
        {!me.verified ? card(<Icon.Shield c={color.trust} />, tx.explore.verifyToSee, tx.explore.verifyToSeeBody, null, () => navigation.navigate('Verify'), 'verify-to-see', color.trust) : beFirst}
        <EmptyState title={tx.explore.empty} body={tx.explore.emptyBody} action={tx.explore.filters} onAction={() => setShowFilters(true)} />
      </View>
    ) : quiet ? (
      <View>
        {!me.verified ? <VerifyRow onPress={() => navigation.navigate('Verify')} /> : null}
        <Text
          style={{
            ...type.meta,
            color: color.fgSecondary,
            marginBottom: space.l,
          }}
        >
          {tx.explore.quietBody}
        </Text>
        {beFirst}
        {plans > 0 ? card(<Icon.Moon c={accent} />, tx.explore.tonightRow(plans), tx.tabs.tonight, null, () => navigation.navigate('Tonight'), 'tonight-row', accent) : null}
        <Text
          style={{
            ...type.caption,
            fontSize: 12,
            letterSpacing: 0.8,
            color: color.fgMuted,
            marginBottom: space.s,
          }}
        >
          {tx.explore.further.toUpperCase()}
        </Text>
      </View>
    ) : items && !me.verified ? (
      <VerifyRow onPress={() => navigation.navigate('Verify')} />
    ) : null;

  const sheetTitle = tray.length > 0 ? tx.explore.activeNow(tray.length) : quiet ? tx.explore.quietTitle : tx.explore.nearby;
  const listPad = box ? TAB_SPACE + space.xxl + (box.h - sheetPx) : 120;

  let body: React.ReactNode;
  if (err && !items) body = <ErrorState text={err} retry={tx.common.retry} onRetry={reload} />;
  else if (!items || !box) body = <Loading />;
  else
    body = (
      <View style={{ flex: 1 }}>
        {/* #113 option B: the map runs full-bleed behind the floating header */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: -headerH,
          }}
        >
          <ExploreMap
            center={camera}
            me={dot}
            data={mapData}
            accent={accent}
            recenter={recenter}
            onRegion={onRegion}
            onSelect={selectPin}
            onClear={() => {
              setSelected(null);
              setPeek(null);
              setPlace(null);
            }}
            selected={selected}
            places={shownPlaces}
            selectedPlace={place?.id ?? null}
            onPlace={(p) => {
              setSelected(null);
              setPeek(null);
              setPlace((cur) => (cur?.id === p.id ? null : p));
            }}
          />
        </View>
        <GridSheet
          h={box.h}
          bottom={TAB_SPACE}
          snap={snap}
          onSnap={changeSnap}
          title={sheetTitle}
          right={items.length ? tx.explore.nearestFirst : undefined}
          above={
            place ? (
              <View style={{ flex: 1 }}>
                <PlaceCard
                  p={place}
                  onClose={() => setPlace(null)}
                  onCheckIn={() =>
                    navigation.navigate('Venue', {
                      venue: {
                        id: place.id,
                        name: place.name,
                        kind: place.kind,
                        geofence_radius_m: 80,
                        here: place.here ?? '0',
                        area_cell: '',
                        distance: place.distance,
                      },
                    })
                  }
                  onJoin={() => navigation.navigate('Party', { id: place.id })}
                />
              </View>
            ) : (
              <>
                <View style={{ flex: 1, alignItems: peek ? 'flex-start' : undefined }}>
                  {snap === 'full' ? null : peek ? (
                    <PeekCard card={peek} onOpen={() => open(peek)} onMore={() => setQuick(peek)} />
                  ) : !safe ? (
                    <PlaceChips active={kinds} onToggle={onLayer} />
                  ) : null}
                </View>
                {snap !== 'full' ? (
                  <Pressable
                    testID="locate-me"
                    accessibilityRole="button"
                    accessibilityLabel={tx.explore.locateMe}
                    onPress={locateMe}
                    style={({ pressed }) => [iconBtn, { backgroundColor: color.bgInverse }, pressed && { opacity: 0.8 }]}
                  >
                    <Icon.Locate c={color.onAccent} />
                  </Pressable>
                ) : null}
              </>
            )
          }
        >
          <FlatList
            ref={list}
            data={items}
            numColumns={3}
            keyExtractor={(c) => c.id}
            columnWrapperStyle={{ gap: space.s }}
            contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l, paddingBottom: listPad }}
            ListHeaderComponent={
              listHead || (!holdSeen && items.length > 0) ? (
                <View>
                  {listHead}
                  {!holdSeen && items.length > 0 ? (
                    <Text testID="hold-hint" style={{ ...type.meta, fontFamily: type.headline.fontFamily, color: color.trust, marginBottom: space.s }}>
                      {mod.holdHint}
                    </Text>
                  ) : null}
                </View>
              ) : undefined
            }
            onEndReached={more}
            onEndReachedThreshold={0.5}
            onScrollToIndexFailed={(e) =>
              list.current?.scrollToOffset({
                offset: e.averageItemLength * e.index,
                animated: true,
              })
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={accent}
                onRefresh={async () => {
                  setRefreshing(true);
                  reloadSummary();
                  await reload();
                  setRefreshing(false);
                }}
              />
            }
            renderItem={({ item, index }) => (
              <View style={{ flex: 1 / 3 }}>
                {index === furtherFrom && !quiet ? <Text style={{ ...type.caption, color: color.fgSecondary, marginBottom: 4 }}>{tx.explore.further}</Text> : null}
                <ProfileTile card={item} selected={item.id === selected} onPress={() => open(item)} onLongPress={() => hold(item)} />
              </View>
            )}
          />
        </GridSheet>
      </View>
    );

  return (
    <View
      style={{ flex: 1, backgroundColor: color.bgMap }}
      onLayout={(e) =>
        setScreen({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
    >
      <View
        style={{ flex: 1, marginTop: headerH }}
        onLayout={(e) =>
          setBox({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
      >
        {body}
      </View>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0 }} onLayout={(e) => setHeaderH(Math.round(e.nativeEvent.layout.height))}>
        {header}
      </View>
      <FiltersSheet
        visible={showFilters}
        mode={filterMode(intents)}
        verified={me.verified}
        value={filters}
        onClose={() => setShowFilters(false)}
        onApply={(f) => {
          setFilters(f);
          AsyncStorage.setItem(MERGED_FILTERS, JSON.stringify(f));
          setShowFilters(false);
        }}
      />
      <NowSheet visible={showNow} onClose={() => setShowNow(false)} />
      <LocationSheet visible={showLocation} onClose={() => setShowLocation(false)} />
      <SafetySheet
        visible={!!quick}
        target={quick ? { id: quick.id, name: quick.display_name, age: quick.age, sub: distanceLabel(quick.distance) } : null}
        onClose={() => setQuick(null)}
        onReport={(t) => navigation.navigate('Report', { profileId: t.id, context: 'explore' })}
        onGone={(_, t) => {
          setItems((cur) => cur?.filter((c) => c.id !== t.id) ?? cur);
          setMapData((m) => (m ? { ...m, pins: m.pins.filter((c) => c.id !== t.id), avatars: m.avatars.filter((c) => c.id !== t.id) } : m));
          if (selected === t.id) {
            setSelected(null);
            setPeek(null);
          }
          reloadSummary();
        }}
        onRestored={() => {
          reload();
          reloadSummary();
        }}
        lead={
          quick ? (
            <>
              <SheetRow testID="quick-open" title={mod.openProfile} onPress={() => { const c = quick; setQuick(null); open(c); }} />
              <SheetRow
                testID="quick-tap"
                title={tx.explore.quick.tap}
                onPress={() => {
                  const c = quick;
                  setQuick(null);
                  api('POST', `/profiles/${c.id}/tap`).then(() => toast(mod.tapped(c.display_name)), (e) => toast(e instanceof ApiError ? e.message : tx.common.error));
                }}
              />
              <SheetRow
                last
                testID="quick-message"
                title={tx.explore.quick.message}
                onPress={() => {
                  const c = quick;
                  setQuick(null);
                  if (!me.verified) toast(tx.explore.unverifiedMessage);
                  else open(c);
                }}
              />
            </>
          ) : null
        }
      />
    </View>
  );
}

// #111 map peek card (R-04.14): first tap on a pin shows it above the sheet; tap opens, ⋯ = safety sheet.
function PeekCard({ card, onOpen, onMore }: { card: Card; onOpen: () => void; onMore: () => void }) {
  return (
    <View testID="peek-card" style={{ alignSelf: 'stretch', marginRight: space.s, flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.s, borderRadius: radius.md, backgroundColor: color.bgRaised }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${card.display_name}, ${card.age}`} onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <Photo uri={card.photo} id={card.id} label={card.display_name} style={{ width: 44, height: 44, borderRadius: radius.sm }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ ...type.headline, color: color.fgPrimary, flexShrink: 1 }}>{`${card.display_name}, ${card.age}`}</Text>
            {card.verified ? <VerifiedTick /> : null}
          </View>
          <Text numberOfLines={1} style={{ ...type.meta, color: color.fgSecondary }}>
            {distanceLabel(card.distance)}
            {card.online ? ` · ${mod.online}` : ''}
          </Text>
        </View>
      </Pressable>
      <Pressable testID="peek-more" accessibilityRole="button" accessibilityLabel={tx.profile.menu} onPress={onMore} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.bgOverlay, alignItems: 'center', justifyContent: 'center' }}>
        <Icon.More size={18} />
      </Pressable>
    </View>
  );
}
