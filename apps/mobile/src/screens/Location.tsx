import * as ExpoLocation from 'expo-location';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { api, ApiError, Me } from '../api/client';
import { areaCell } from '../geo/cells';
import { o } from '../i18n/onboarding';
import { t } from '../i18n/strings';
import { STEP_OF } from '../onboarding/flow';
import { k, StepShell, tick } from '../onboarding/kit';
import { color, font, radius, space } from '../theme/tokens';
import { ErrorText } from '../ui';

type Level = 'hidden' | 'city' | 'area' | 'exact';
type City = { id: number; name: string; country: string };
const LEVELS: Level[] = ['hidden', 'city', 'area', 'exact'];

// S-04 v2 (R-02.6): live map preview per level; Area default; Hidden locked until verified. Only the r9 cell leaves the phone.
export function LocationScreen({ me, onDone }: { me: Me; onDone: (me: Me) => void }) {
  const [level, setLevel] = useState<Level>('area');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');
  const [cities, setCities] = useState<City[]>([]);

  async function allow() {
    setErr(null);
    if (level === 'city') return setPicker(true);
    setBusy(true);
    try {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setPicker(true);
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
      onDone(await api<Me>('PUT', '/me/location', { level, cell_r9: areaCell(pos.coords.latitude, pos.coords.longitude) }));
    } catch (e) {
      if (e instanceof ApiError) setErr(e.message);
      else setPicker(true);
    } finally {
      setBusy(false);
    }
  }

  async function search(v: string) {
    setQ(v);
    if (v.trim().length < 2) return setCities([]);
    try {
      const r = await api<{ cities: City[] }>('GET', '/cities?q=' + encodeURIComponent(v.trim()));
      setCities(r.cities);
    } catch {
      setCities([]);
    }
  }

  async function chooseCity(c: City) {
    setBusy(true);
    try {
      onDone(await api<Me>('PUT', '/me/location', { level: 'city', city_id: c.id }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  if (picker) {
    // S-04b
    return (
      <StepShell step={STEP_OF.location} onBack={() => setPicker(false)} title={o.location.cityTitle} sub={o.location.citySub} scroll>
        <TextInput
          testID="city-search"
          accessibilityLabel={o.location.cityPh}
          value={q}
          onChangeText={search}
          placeholder={o.location.cityPh}
          placeholderTextColor={color.fgMuted}
          autoFocus
          selectionColor={color.trust}
          style={l.search}
        />
        <View style={{ gap: space.s }}>
          {cities.map((c) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={busy ? undefined : () => chooseCity(c)} style={({ pressed }) => [l.cityRow, pressed && k.pressed]}>
              <Text style={l.cityName}>{c.name}</Text>
              <Text style={l.cityCountry}>{c.country}</Text>
            </Pressable>
          ))}
        </View>
        <ErrorText text={err} />
      </StepShell>
    );
  }

  return (
    <StepShell
      step={STEP_OF.location}
      title={o.location.title}
      scroll
      cta={{ title: level === 'city' ? o.location.pickCity : o.location.allow, testID: 'allow-location', fill: color.trust, busy, onPress: allow }}
      below={
        <View style={l.footer}>
          <Shield />
          <Text style={l.footerText}>{o.location.footer}</Text>
        </View>
      }
    >
      <MapPreview level={level} />
      <View style={{ gap: space.s }} accessibilityRole="radiogroup">
        {LEVELS.map((lv) => {
          const locked = (lv === 'hidden' || lv === 'exact') && !me.verified; // AC-05.4
          const on = level === lv;
          const [title, sub0] = o.location.levels[lv];
          const sub = locked && lv === 'exact' ? o.location.exactLocked : sub0;
          return (
            <Pressable
              key={lv}
              testID={`level-${lv}`}
              accessibilityRole="radio"
              accessibilityLabel={`${title}. ${sub}`}
              accessibilityState={{ checked: on, disabled: locked }}
              onPress={locked ? undefined : () => { tick(); setLevel(lv); }}
              style={({ pressed }) => [l.opt, on && l.optOn, locked && { opacity: 0.5 }, pressed && !locked && k.pressed]}
            >
              <View style={[l.radio, on && l.radioOn]} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={l.optHead}>
                  <Text style={l.optTitle}>{title}</Text>
                  {lv === 'area' ? <Text style={l.badge}>{o.location.defaultBadge}</Text> : null}
                  {locked ? <Lock /> : null}
                </View>
                <Text style={l.optSub}>{sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <ErrorText text={err} />
    </StepShell>
  );
}

/** Stylised map: roads, water and a teal zone sized to the level (R-02.6). Decorative, so hidden from screen readers. */
function MapPreview({ level }: { level: Level }) {
  const ring = { hidden: 0, city: 300, area: 110, exact: 40 }[level];
  const dashed = level === 'city';
  return (
    <View style={l.map} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[l.road, { top: 60, height: 10, transform: [{ rotate: '-8deg' }] }]} />
      <View style={[l.road, { top: 118, height: 6, backgroundColor: color.mapRoadMinor, transform: [{ rotate: '5deg' }] }]} />
      <View style={[l.roadV, { left: 120, width: 9, transform: [{ rotate: '12deg' }] }]} />
      <View style={[l.roadV, { left: 270, width: 6, transform: [{ rotate: '-6deg' }] }]} />
      <View style={l.water} />
      {ring ? (
        <View style={[l.center, { width: ring, height: ring, marginLeft: -ring / 2, marginTop: -ring / 2, borderRadius: ring / 2, borderStyle: dashed ? 'dashed' : 'solid', backgroundColor: dashed ? 'rgba(61,214,195,0.10)' : 'rgba(61,214,195,0.18)', borderColor: dashed ? 'rgba(61,214,195,0.6)' : color.trust }]} />
      ) : null}
      {level !== 'city' && level !== 'hidden' ? <View style={[l.center, l.pin]} /> : null}
      <Text style={l.caption}>{o.location.caption[level]}</Text>
    </View>
  );
}

const Lock = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.fgMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={4} y={11} width={16} height={10} rx={2} />
    <Path d="M8 11V7a4 4 0 018 0v4" />
  </Svg>
);
const Shield = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.trust} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
  </Svg>
);

const l = StyleSheet.create({
  map: { height: 168, borderRadius: 28, overflow: 'hidden', backgroundColor: color.bgMap, marginTop: space.xs },
  road: { position: 'absolute', left: -20, right: -20, backgroundColor: color.mapRoad },
  roadV: { position: 'absolute', top: -20, bottom: -20, backgroundColor: color.mapRoad },
  water: { position: 'absolute', right: -30, top: -40, width: 140, height: 90, borderRadius: 70, backgroundColor: color.mapWater },
  center: { position: 'absolute', left: '50%', top: '50%', borderWidth: 2 },
  pin: { width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: 8, backgroundColor: color.trust, borderColor: color.bgBase, borderWidth: 3 },
  caption: { position: 'absolute', left: 14, bottom: 12, overflow: 'hidden', paddingHorizontal: space.m, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: color.bgRaised, fontFamily: font.bold, fontSize: 13, color: color.trust },
  opt: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, borderRadius: radius.md, backgroundColor: color.bgRaised, borderWidth: 2, borderColor: color.bgRaised },
  optOn: { borderColor: color.trust },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.line },
  radioOn: { borderWidth: 6, borderColor: color.trust },
  optHead: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  optTitle: { fontFamily: font.heavy, fontSize: 16, color: color.fgPrimary },
  optSub: { fontFamily: font.medium, fontSize: 13, lineHeight: 17, color: color.fgSecondary },
  badge: { overflow: 'hidden', fontFamily: font.heavy, fontSize: 11, paddingHorizontal: space.s, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: color.personal, color: color.onAccent },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: space.s },
  footerText: { fontFamily: font.regular, fontSize: 13, color: color.fgSecondary },
  search: { marginTop: space.m, minHeight: 56, borderRadius: radius.pill, borderWidth: 2, borderColor: color.line, backgroundColor: color.bgRaised, color: color.fgPrimary, fontFamily: font.regular, fontSize: 17, paddingHorizontal: 22 },
  cityRow: { minHeight: 56, borderRadius: radius.md, backgroundColor: color.bgRaised, paddingHorizontal: space.l, paddingVertical: space.m, justifyContent: 'center' },
  cityName: { fontFamily: font.heavy, fontSize: 16, color: color.fgPrimary },
  cityCountry: { fontFamily: font.medium, fontSize: 13, color: color.fgSecondary },
});
