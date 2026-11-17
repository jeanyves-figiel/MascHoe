import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { cellCenter } from '../geo/cells';
import { t } from '../i18n/strings';
import { displayCount } from '../onboarding/flow';
import { color, radius, space } from '../theme/tokens';
import { Body, Button, H1, Screen, s } from '../ui';

type Welcome = { city: string | null; center: { lat: number; lng: number } | null; count: number | null; cells: { cell: string; count: number }[] };

// S-01 (R-02.2): live blurred activity around an approximate city; no permission needed.
export function WelcomeScreen({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const [w, setW] = useState<Welcome | null>(null);
  useEffect(() => {
    api<Welcome>('GET', '/welcome').then(setW).catch(() => setW(null));
  }, []);
  const n = displayCount(w?.count ?? null);

  return (
    <Screen>
      <BlurMap w={w} />
      <H1>{n ? t.welcome.count(n) : t.welcome.joining}</H1>
      <View style={{ gap: space.s }}>
        {t.welcome.promises.map((p) => (
          <Body key={p} muted>
            • {p}
          </Body>
        ))}
      </View>
      <View style={s.spacer} />
      <Button testID="start" title={t.welcome.start} onPress={onStart} />
      <Button title={t.welcome.login} kind="ghost" onPress={onLogin} />
    </Screen>
  );
}

function BlurMap({ w }: { w: Welcome | null }) {
  const size = 280;
  const dots = (w?.cells ?? []).map((c) => {
    const [lat, lng] = cellCenter(c.cell);
    const c0 = w!.center!;
    // ~±12 km window
    const x = ((lng - c0.lng) / 0.32 + 0.5) * size;
    const y = (0.5 - (lat - c0.lat) / 0.22) * size;
    return { key: c.cell, x, y, r: Math.min(10 + c.count * 1.6, 46) };
  });
  return (
    <View style={m.map} accessibilityLabel={w?.city ? `Activity around ${w.city}` : 'Activity map'}>
      <View style={[m.inner, { width: size, height: size }]}>
        {dots.map((d) => (
          <View key={d.key} style={[m.dot, { left: d.x - d.r, top: d.y - d.r, width: d.r * 2, height: d.r * 2, borderRadius: d.r }]} />
        ))}
      </View>
      {w?.city ? <Text style={m.city}>{w.city}</Text> : null}
    </View>
  );
}

const m = StyleSheet.create({
  map: { height: 220, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: color.bgRaised, alignItems: 'center', justifyContent: 'center' },
  inner: { position: 'relative', filter: 'blur(10px)' } as object,
  dot: { position: 'absolute', backgroundColor: color.hookup, opacity: 0.35 },
  city: { position: 'absolute', bottom: space.s, left: space.m, color: color.fgSecondary, fontSize: 13 },
});
