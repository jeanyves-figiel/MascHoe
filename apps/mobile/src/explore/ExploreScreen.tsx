import AsyncStorage from '@react-native-async-storage/async-storage';
import { cellToLatLng } from 'h3-js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
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
import { FiltersSheet } from './FiltersSheet';
import { devicePosition, lastKnown, LatLng, locateDevice, onDevicePosition, syncLocation } from './location';
import { LocationSheet } from './LocationSheet';

type View_ = 'map' | 'grid';
const FILTER_KEY = (m: string) => 'thirstr.filters.' + m;
const VIEW_KEY = 'thirstr.exploreView';

// S-10 / S-11 Explore (F-04). AC-04.1: cold start → profile → Message in ≤ 3 taps.
export function ExploreScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { me, setMe, mode, setMode } = useSession();
  // RF-5: no main photo yet = invisible; nudge before the verify banner.
  const hasMain = !!me.profile?.photos.some((x) => x.slot === 0 && x.status === 'ok_main');
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<View_>('map');
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
    AsyncStorage.getItem(VIEW_KEY).then((v) => (v === 'grid' || v === 'map') && setView(v));
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

  const open = useCallback((c: Card) => navigation.navigate('Profile', { id: c.id }), [navigation]);

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
      return { lat, lng, zoom: 10 };
    }
    return null;
  })();

  async function locateMe() {
    const p = await locateDevice().catch(() => null);
    if (!p && !center) return setShowLocation(true);
    setRecenter((n) => n + 1);
  }

  const level = me.location?.level ?? 'city';
  const locLabel = me.incognito ? tx.location.incognito : (tx.location.levels[level] ?? tx.location.levels.city)[0];

  const setViewSaved = (v: View_) => {
    setView(v);
    AsyncStorage.setItem(VIEW_KEY, v);
  };
  const iconBtn = { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.bgRaised, alignItems: 'center' as const, justifyContent: 'center' as const };

  // App v2 header (design-system.md › App v2 rules): wordmark + location chip + filters; mode switch + Map/Grid icons.
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
        <View accessibilityRole="tablist" accessibilityLabel="View" style={{ flexDirection: 'row', gap: 3, padding: 3, borderRadius: radius.pill, backgroundColor: color.bgRaised }}>
          {(['map', 'grid'] as View_[]).map((v) => {
            const on = view === v;
            const I = v === 'map' ? Icon.Map : Icon.Grid;
            return (
              <Pressable
                key={v}
                testID={`view-${v}`}
                accessibilityRole="tab"
                accessibilityLabel={v === 'map' ? tx.explore.map : tx.explore.grid}
                accessibilityState={{ selected: on }}
                onPress={() => setViewSaved(v)}
                style={{ width: 44, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.bgInverse : 'transparent' }}
              >
                <I c={on ? color.onAccent : color.fgPrimary} />
              </Pressable>
            );
          })}
        </View>
      </View>
      {!hasMain ? (
        <Banner testID="photo-banner" tone="warn" text={tx.explore.photoBanner} onPress={() => navigation.navigate('EditProfile')} />
      ) : !me.verified ? (
        <Banner text={tx.explore.verifyBanner} onPress={() => navigation.navigate('Verify')} />
      ) : null}
      {me.safe_mode_active || me.safe_mode === 'on' ? <Banner tone="personal" text={tx.explore.safeMode} /> : null}
    </View>
  );

  let body: React.ReactNode;
  if (err && !items) body = <ErrorState text={err} retry={tx.common.retry} onRetry={reload} />;
  else if (!items) body = <Loading />;
  else if (view === 'map')
    body = (
      <View style={{ flex: 1 }}>
        <ExploreMap center={center} me={dot} data={mapData} accent={accent} recenter={recenter} onRegion={onRegion} onSelect={open} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 96 }}>
          <View style={{ alignItems: 'flex-end', paddingHorizontal: space.l, paddingBottom: space.s }}>
            <Pressable
              testID="locate-me"
              accessibilityRole="button"
              accessibilityLabel={tx.explore.locateMe}
              onPress={locateMe}
              style={({ pressed }) => [iconBtn, { borderWidth: 1, borderColor: color.line }, pressed && { opacity: 0.8 }]}
            >
              <Icon.Locate c={color.trust} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: space.l, paddingBottom: space.s, gap: space.s }}>
            <Text style={{ ...type.headline, color: color.fgPrimary, flex: 1 }}>{tx.explore.activeNow(tray.length)}</Text>
            <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.explore.nearestFirst}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: space.l }}>
            {tray.map((c) => (
              <ProfileTile key={c.id} card={c} tray onPress={() => open(c)} onLongPress={() => setQuick(c)} />
            ))}
          </ScrollView>
        </View>
      </View>
    );
  else if (items.length === 0)
    body = <EmptyState title={tx.explore.empty} body={tx.explore.emptyBody} action={tx.explore.filters} onAction={() => setShowFilters(true)} />;
  else
    body = (
      <FlatList
        data={items}
        numColumns={3}
        keyExtractor={(c) => c.id}
        columnWrapperStyle={{ gap: 6 }}
        contentContainerStyle={{ gap: 6, padding: space.s, paddingBottom: 120 }}
        onEndReached={more}
        onEndReachedThreshold={0.5}
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
            {index === furtherFrom ? <Text style={{ ...type.caption, color: color.fgSecondary, marginBottom: 4 }}>{tx.explore.further}</Text> : null}
            <ProfileTile card={item} onPress={() => open(item)} onLongPress={() => setQuick(item)} />
          </View>
        )}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      {header}
      <View style={{ flex: 1, marginTop: space.s }}>{body}</View>
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
