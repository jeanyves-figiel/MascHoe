import * as ExpoLocation from 'expo-location';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError, Me } from '../api/client';
import { areaCell } from '../geo/cells';
import { t } from '../i18n/strings';
import { color, radius, space, type } from '../theme/tokens';
import { Body, Button, ErrorText, Field, H1, Screen } from '../ui';

type Level = 'hidden' | 'city' | 'area' | 'exact';
type City = { id: number; name: string; country: string };

// S-04 (R-02.6): explain before the OS prompt; Area default; Hidden disabled until verified.
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
      // Coordinates stay on the device: only the r9 cell is sent.
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
    const r = await api<{ cities: City[] }>('GET', '/cities?q=' + encodeURIComponent(v.trim()));
    setCities(r.cities);
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
      <Screen progress={3}>
        <H1>{t.location.denied}</H1>
        <Field label={t.location.cityPh} placeholder={t.location.cityPh} value={q} onChangeText={search} autoFocus />
        {cities.map((c) => (
          <Button key={c.id} kind="secondary" title={`${c.name}, ${c.country}`} busy={busy} onPress={() => chooseCity(c)} />
        ))}
        <ErrorText text={err} />
      </Screen>
    );
  }

  return (
    <Screen progress={3}>
      <H1>{t.location.title}</H1>
      <Body muted>{t.location.explain}</Body>
      <View style={{ gap: space.s }} accessibilityRole="radiogroup">
        {(['hidden', 'city', 'area', 'exact'] as Level[]).map((l) => {
          const disabled = l === 'hidden' && !me.verified;
          const on = level === l;
          const [title, sub] = t.location.levels[l];
          return (
            <Pressable
              key={l}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled }}
              onPress={disabled ? undefined : () => setLevel(l)}
              style={{ padding: space.m, borderRadius: radius.md, borderWidth: 1, borderColor: on ? color.trust : color.line, backgroundColor: color.bgRaised, opacity: disabled ? 0.45 : 1 }}
            >
              <Text style={{ ...type.headline, color: on ? color.trust : color.fgPrimary }}>{title}</Text>
              <Text style={{ ...type.meta, color: color.fgSecondary }}>{sub}</Text>
            </Pressable>
          );
        })}
      </View>
      <ErrorText text={err} />
      <Button testID="allow-location" title={t.location.allow} busy={busy} onPress={allow} />
    </Screen>
  );
}
