import AsyncStorage from '@react-native-async-storage/async-storage';
import { cellToLatLng } from 'h3-js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import type { Card, MapData } from '../api/types';
import { useSession } from '../app/session';
import { tx } from '../i18n/app';
import { color, modeColor, radius, space, type } from '../theme/tokens';
import { Banner, EmptyState, ErrorState, Icon, Loading, Segmented, Sheet, Wordmark, useAccent } from '../ui';
import { ProfileTile } from './Card';
import { defaultFilters, Filters, loadGrid, loadMap, loadTray } from './explore';
import { ExploreMap } from './ExploreMap';
import { GridSheet, Snap, snapHeight } from './GridSheet';
import { fitCamera, isNear } from './mapShared';
import { NowSheet } from '../me/NowSheet';
import { FiltersSheet } from './FiltersSheet';
import { devicePosition, lastKnown, LatLng, locateDevice, onDevicePosition, syncLocation } from './location';
import { LocationSheet } from './LocationSheet';

const FILTER_KEY = (m: string) => 'thirstr.filters.' + m;
const SNAP_KEY = 'thirstr.exploreSnap';
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
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [quick, setQuick] = useState<Card | null>(null);
  const bbox = useRef<[number, number, number, number] | null>(null);
  const [locTick, setLocTick] = useState(0);
  const [device, setDevice] = useState<LatLng | null>(devicePosition());
  const [recenter, setRecenter] = useState(0);

  useEffect(() => onDevicePosition(setDevice), []);

  useEffect(() => {
    AsyncStorage.getItem(SNAP_KEY).then((v) => (v === 'peek' || v === 'half' || v === 'full') && setSnap(v));
  }, []);

  // Filters saved per mode (R-04.8).
  useEffect(() => {
    AsyncStorage.getItem(FILTER_KEY(mode)).then((f) => setFilters(f ? { ...defaultFilters, ...JSON.parse(f) } : defaultFilters));
  }, [mode]);

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

  const reload = useCallback(
    () =>
      Promise.all([loadGrid(mode, filters), loadTray(mode, filters), bbox.current ? loadMap(mode, filters, bbox.current) : Promise.resolve(null)]).then(
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
    [mode, filters],
  );

  useEffect(() => {
    reload();
  }, [reload, me.location?.level, locTick]);

  const onRegion = useCallback(
    (b: [number, number, number, number]) => {
      bbox.current = b;
      loadMap(mode, filters, b).then(setMapData).catch(() => {});
    },
    [mode, filters],
  );

  async function more() {
    if (!next) return;
    const g = await loadGrid(mode, filters, next);
    setItems((cur) => [...(cur ?? []), ...g.items]);
    setNext(g.next);
  }

  const open = useCallback((c: Card) => navigation.navigate('Profile', { id: c.id, mode }), [navigation, mode]);
  // R-04.14: first tap on a pin selects it (tile highlighted), a tap on the selected pin opens the profile.
  const selectPin = useCallback(
    (c: Card) => {
      if (selected === c.id) return open(c);
      setSelected(c.id);
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
    if (i >= 0) list.current?.scrollToIndex({ index: Math.floor(i / 3), animated: true, viewPosition: 0.2 });
  }, [selected, items]);
  // R-04.1: the viewer isn't shown in this mode → one tap turns it on (Sport opens its fields).
  const own = me.profile ?? me.profiles?.[0];
  const notShown = !!own && !(own.show_in ?? ['hookup']).includes(mode);
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
  const camera = center && box ? fitCamera(center, fitM, box.w, box.h, Math.min(sheetPx, box.h * 0.6)) : center;
  const quiet = !!items && items.length > 0 && !items.some((c) => isNear(c.distance));
  useEffect(() => {
    if (!quiet) return;
    api<{ plans: unknown[] }>('GET', `/tonight?mode=${mode}`)
      .then((r) => setPlans(r.plans?.length ?? 0))
      .catch(() => setPlans(0));
  }, [quiet, mode]);

  async function locateMe() {
    const p = await locateDevice().catch(() => null);
    if (!p && !center) return setShowLocation(true);
    setRecenter((n) => n + 1);
  }

  const level = me.location?.level ?? 'city';
  const locLabel = me.incognito ? tx.location.incognito : (tx.location.levels[level] ?? tx.location.levels.city)[0];

  const iconBtn = { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.bgRaised, alignItems: 'center' as const, justifyContent: 'center' as const };

  // App v2 header (design-system.md › App v2 rules): wordmark + location chip + filters; mode switch (no Map/Grid toggle, #100).
  const header = (
    <View style={{ paddingTop: insets.top + space.s, paddingHorizontal: space.l, gap: space.m, paddingBottom: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <View style={{ flex: 1 }}>
          <Wordmark />
        </View>
        <Pressable
          testID="location-pill"
          accessibilityRole="button"
          accessibilityLabel={`Location: ${locLabel}`}
          onPress={() => setShowLocation(true)}
          style={({ pressed }) => [{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.bgRaised, flexDirection: 'row', alignItems: 'center', gap: 6 }, pressed && { opacity: 0.8 }]}
        >
          <Icon.Pin size={15} c={color.trust} w={2} />
          <Text style={{ ...type.meta, fontFamily: type.headline.fontFamily, color: color.fgPrimary }}>{locLabel}</Text>
        </Pressable>
        <Pressable testID="filters-btn" accessibilityRole="button" accessibilityLabel={tx.explore.filters} onPress={() => setShowFilters(true)} style={({ pressed }) => [iconBtn, pressed && { opacity: 0.8 }]}>
          <Icon.Filter />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <View style={{ flex: 1 }}>
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            fills={modeColor}
            options={[
              { value: 'hookup', label: tx.modes.hookup },
              { value: 'friends', label: tx.modes.friends },
              { value: 'sport', label: tx.modes.sport },
            ]}
          />
        </View>
      </View>
      {!hasMain ? (
        <Banner testID="photo-banner" tone="warn" text={tx.explore.photoBanner} onPress={() => navigation.navigate('EditProfile')} />
      ) : !me.verified ? (
        <Banner text={tx.explore.verifyBanner} onPress={() => navigation.navigate('Verify')} />
      ) : null}
      {hasMain && notShown ? <Banner testID="lens-banner" tone="warn" text={tx.explore.notShownIn(tx.modes[mode])} onPress={showMe} /> : null}
      {me.safe_mode_active || me.safe_mode === 'on' ? <Banner tone="personal" text={tx.explore.safeMode} /> : null}
    </View>
  );

  const card = (icon: React.ReactNode, title: string, sub: string, action: string | null, onPress: () => void, testID: string, tint: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: 14, borderRadius: radius.tray, backgroundColor: color.bgRaised, marginBottom: space.l }, pressed && { opacity: 0.85 }]}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tint + '29', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...type.headline, color: color.fgPrimary }}>{title}</Text>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>{sub}</Text>
      </View>
      {action ? (
        <View style={{ height: 40, paddingHorizontal: space.l, borderRadius: radius.pill, backgroundColor: accent, justifyContent: 'center' }}>
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
        {!me.verified
          ? card(<Icon.Shield c={color.trust} />, tx.explore.verifyToSee, tx.explore.verifyToSeeBody, null, () => navigation.navigate('Verify'), 'verify-to-see', color.trust)
          : beFirst}
        <EmptyState title={tx.explore.empty} body={tx.explore.emptyBody} action={tx.explore.filters} onAction={() => setShowFilters(true)} />
      </View>
    ) : quiet ? (
      <View>
        <Text style={{ ...type.meta, color: color.fgSecondary, marginBottom: space.l }}>{tx.explore.quietBody}</Text>
        {beFirst}
        {plans > 0 ? card(<Icon.Moon c={accent} />, tx.explore.tonightRow(plans), tx.tabs.tonight, null, () => navigation.navigate('Tonight'), 'tonight-row', accent) : null}
        <Text style={{ ...type.caption, fontSize: 12, letterSpacing: 0.8, color: color.fgMuted, marginBottom: space.s }}>{tx.explore.further.toUpperCase()}</Text>
      </View>
    ) : null;

  const sheetTitle = tray.length > 0 ? tx.explore.activeNow(tray.length) : quiet ? tx.explore.quietTitle : tx.explore.nearby;
  const listPad = box ? TAB_SPACE + space.xxl + (box.h - sheetPx) : 120;

  let body: React.ReactNode;
  if (err && !items) body = <ErrorState text={err} retry={tx.common.retry} onRetry={reload} />;
  else if (!items || !box) body = <Loading />;
  else
    body = (
      <View style={{ flex: 1 }}>
        <ExploreMap center={camera} me={dot} data={mapData} accent={accent} recenter={recenter} onRegion={onRegion} onSelect={selectPin} onClear={() => setSelected(null)} selected={selected} />
        <GridSheet
          h={box.h}
          bottom={TAB_SPACE}
          snap={snap}
          onSnap={changeSnap}
          title={sheetTitle}
          right={items.length ? tx.explore.nearestFirst : undefined}
          above={
            <>
              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                {fitM && snap !== 'full' ? (
                  <View testID="fit-chip" style={{ height: 30, paddingHorizontal: space.m, borderRadius: radius.pill, backgroundColor: color.scrim, justifyContent: 'center' }}>
                    <Text style={{ ...type.caption, fontSize: 12, color: color.fgSecondary }}>{fitM >= 5000 ? tx.explore.fitFar : tx.explore.fitNear}</Text>
                  </View>
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
          }
        >
          <FlatList
            ref={list}
            data={items}
            numColumns={3}
            keyExtractor={(c) => c.id}
            columnWrapperStyle={{ gap: space.s }}
            contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l, paddingBottom: listPad }}
            ListHeaderComponent={listHead ?? undefined}
            onEndReached={more}
            onEndReachedThreshold={0.5}
            onScrollToIndexFailed={(e) => list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: true })}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={accent}
                onRefresh={async () => {
                  setRefreshing(true);
                  await reload();
                  setRefreshing(false);
                }}
              />
            }
            renderItem={({ item, index }) => (
              <View style={{ flex: 1 / 3 }}>
                {index === furtherFrom && !quiet ? <Text style={{ ...type.caption, color: color.fgSecondary, marginBottom: 4 }}>{tx.explore.further}</Text> : null}
                <ProfileTile card={item} selected={item.id === selected} onPress={() => open(item)} onLongPress={() => setQuick(item)} />
              </View>
            )}
          />
        </GridSheet>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      {header}
      <View style={{ flex: 1, marginTop: space.s }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {body}
      </View>
      <FiltersSheet
        visible={showFilters}
        mode={mode}
        verified={me.verified}
        value={filters}
        onClose={() => setShowFilters(false)}
        onApply={(f) => {
          setFilters(f);
          AsyncStorage.setItem(FILTER_KEY(mode), JSON.stringify(f));
          setShowFilters(false);
        }}
      />
      <NowSheet visible={showNow} onClose={() => setShowNow(false)} />
      <LocationSheet visible={showLocation} onClose={() => setShowLocation(false)} />
      <Sheet visible={!!quick} onClose={() => setQuick(null)} title={quick ? `${quick.display_name}, ${quick.age}` : ''} closeLabel={tx.common.close}>
        {quick ? <QuickActions card={quick} onDone={() => setQuick(null)} onOpen={() => open(quick)} onChanged={reload} /> : null}
      </Sheet>
    </View>
  );
}

// F-04 long-press quick actions: tap, message, hide, block.
function QuickActions({ card, onDone, onOpen, onChanged }: { card: Card; onDone: () => void; onOpen: () => void; onChanged: () => void }) {
  const { me } = useSession();
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, close = true) => {
    try {
      await fn();
      if (close) {
        onDone();
        onChanged();
      }
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : tx.common.error);
    }
  };
  const row = (label: string, onPress: () => void, danger?: boolean) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} style={{ paddingVertical: space.m }}>
      <Text style={{ ...type.headline, color: danger ? color.danger : color.fgPrimary }}>{label}</Text>
    </Pressable>
  );
  return (
    <View>
      {row(tx.explore.quick.tap, () => act(() => api('POST', `/profiles/${card.id}/tap`)))}
      {row(tx.explore.quick.message, () => {
        if (!me.verified) setMsg(tx.explore.unverifiedMessage);
        else {
          onDone();
          onOpen();
        }
      })}
      {row(tx.explore.quick.hide, () => act(() => api('POST', `/profiles/${card.id}/hide`)))}
      {row(tx.explore.quick.block, () => act(() => api('POST', `/profiles/${card.id}/block`)), true)}
      {msg ? <Banner text={msg} tone="warn" /> : null}
    </View>
  );
}
