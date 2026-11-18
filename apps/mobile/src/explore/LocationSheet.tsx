import { cellToParent, latLngToCell } from 'h3-js';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError, Me } from '../api/client';
import { useSession } from '../app/session';
import { areaCell } from '../geo/cells';
import { tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { Banner, Button, Chip, Chips, ErrorText, Field, Label, Sheet, Toggle } from '../ui';
import { currentPosition, lastKnown } from './location';

export type Level = 'hidden' | 'city' | 'area' | 'exact';
type City = { id: number; name: string; country: string };
const TTLS = [1800, 3600, 7200, 14400];

async function position() {
  const p = await currentPosition().catch(() => null);
  if (p) return p;
  const lk = lastKnown();
  return lk ? { lat: lk.lat, lng: lk.lng } : null;
}

/**
 * One-tap level change from Me (S-60, #102) for Hidden / City / Area. Returns null when it needs
 * the full sheet (no position for City/Area: city search or permission), else the updated Me.
 */
export async function quickLevel(level: Exclude<Level, 'exact'>): Promise<Me | null> {
  const p = await position();
  if (!p) return null;
  if (level === 'city') return api<Me>('PUT', '/me/location', { level: 'city', cell_r5: cellToParent(latLngToCell(p.lat, p.lng, 9), 5) });
  return api<Me>('PUT', '/me/location', { level, cell_r9: areaCell(p.lat, p.lng) });
}

// S-30 Location sheet (F-05): 4 levels, Exact TTL + audience + confirm, Safe Mode second warning,
// hide-from-hidden, incognito, "Others see" preview.
// `initial` preselects a level (Me's location segment opens the sheet on Exact, #102).
export function LocationSheet({ visible, onClose, initial }: { visible: boolean; onClose: () => void; initial?: Level }) {
  const { me, setMe } = useSession();
  const current = (me.location?.level ?? 'city') as Level;
  const [level, setLevel] = useState<Level>(initial ?? current);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setLevel(initial ?? current);
  }
  const [ttl, setTtl] = useState(3600);
  const [audience, setAudience] = useState('verified');
  const [confirming, setConfirming] = useState(false);
  const [safeWarn, setSafeWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cityQ, setCityQ] = useState('');
  const [cities, setCities] = useState<City[] | null>(null);
  const safeOn = me.safe_mode === 'on' || !!me.safe_mode_active;

  const run = async (fn: () => Promise<Me>) => {
    setErr(null);
    setBusy(true);
    try {
      setMe(await fn());
      return true;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tx.common.error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  async function apply(override = false) {
    if (level === 'exact') {
      if (safeOn && !override) return setSafeWarn(true);
      if (!confirming) return setConfirming(true);
      const p = await position();
      if (!p) return setErr(tx.location.permission);
      const ok = await run(async () => {
        await api('PUT', '/me/location', { level: 'exact', cell_r9: areaCell(p.lat, p.lng), safe_mode_override: override || undefined });
        return api<Me>('PUT', '/me/pin', { lat: p.lat, lng: p.lng, ttl_s: ttl, audience, confirm: true, safe_mode_override: override || undefined });
      });
      if (ok) done();
      return;
    }
    const p = await position();
    if (level === 'city') {
      if (!p) return setCities([]);
      const ok = await run(() => api<Me>('PUT', '/me/location', { level: 'city', cell_r5: cellToParent(latLngToCell(p.lat, p.lng, 9), 5) }));
      if (ok) done();
      return;
    }
    if (!p) return setErr(tx.location.permission);
    const ok = await run(() => api<Me>('PUT', '/me/location', { level, cell_r9: areaCell(p.lat, p.lng) }));
    if (ok) done();
  }

  function done() {
    setConfirming(false);
    setSafeWarn(false);
    setCities(null);
    onClose();
  }

  async function searchCity(v: string) {
    setCityQ(v);
    if (v.trim().length < 2) return setCities([]);
    const r = await api<{ cities: City[] }>('GET', '/cities?q=' + encodeURIComponent(v.trim()));
    setCities(r.cities);
  }

  const preview =
    me.incognito || level === 'hidden'
      ? tx.location.preview.hidden
      : level === 'city'
        ? tx.location.preview.city('…')
        : level === 'area'
          ? tx.location.preview.area
          : tx.location.preview.exact;

  const pin = me.location?.pin;

  return (
    <Sheet visible={visible} onClose={done} title={tx.location.title} closeLabel={tx.common.close}>
      <View style={{ gap: space.s }} accessibilityRole="radiogroup">
        {(['hidden', 'city', 'area', 'exact'] as Level[]).map((l) => {
          const locked = (l === 'hidden' || l === 'exact') && !me.verified;
          const on = level === l;
          const [title, sub] = tx.location.levels[l];
          return (
            <Pressable
              key={l}
              testID={`level-${l}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: locked }}
              disabled={locked}
              onPress={() => {
                setLevel(l);
                setConfirming(false);
                setSafeWarn(false);
              }}
              style={{
                padding: space.m,
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: on ? color.trust : color.line,
                backgroundColor: color.bgRaised,
                opacity: locked ? 0.45 : 1,
              }}
            >
              <Text style={{ ...type.headline, color: color.fgPrimary }}>{title}</Text>
              <Text style={{ ...type.meta, color: color.fgSecondary }}>
                {locked ? (l === 'hidden' ? tx.location.hiddenLocked : tx.location.exactLocked) : sub}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {level === 'exact' ? (
        <View style={{ gap: space.s }}>
          <Label>{tx.location.ttl}</Label>
          <Chips>
            {TTLS.map((t) => (
              <Chip key={t} label={t < 3600 ? '30 min' : `${t / 3600} h`} on={ttl === t} onPress={() => setTtl(t)} fill={color.trust} />
            ))}
          </Chips>
          <Label>{tx.location.audience}</Label>
          <Chips>
            {['verified', 'chats', 'everyone'].map((a) => (
              <Chip key={a} label={tx.location.audiences[a]} on={audience === a} onPress={() => setAudience(a)} fill={color.trust} />
            ))}
          </Chips>
        </View>
      ) : null}

      {pin ? (
        <View style={{ gap: space.xs }}>
          <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.location.expires(new Date(pin.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</Text>
          <Button kind="secondary" small title={tx.location.stopPin} busy={busy} onPress={() => run(() => api<Me>('DELETE', '/me/pin'))} />
        </View>
      ) : null}

      <View style={{ padding: space.m, borderRadius: radius.md, backgroundColor: color.bgOverlay, gap: 4 }}>
        <Label>{tx.location.othersSee}</Label>
        <Text testID="others-see" style={{ ...type.body, color: color.fgPrimary }}>
          {preview}
        </Text>
      </View>

      <Toggle
        label={tx.location.hideFromHidden}
        sub={tx.location.hideFromHiddenSub}
        value={!!me.location?.hide_from_hidden}
        onChange={(v) => run(() => api<Me>('PATCH', '/me/visibility', { hide_from_hidden: v }))}
      />
      <Toggle
        label={tx.location.incognito}
        sub={me.verified ? tx.location.incognitoSub : tx.common.verifyToDo}
        disabled={!me.verified}
        value={!!me.incognito}
        onChange={(v) => run(() => api<Me>('PATCH', '/me/visibility', { incognito: v }))}
      />

      {cities ? (
        <View style={{ gap: space.s }}>
          <Field label={tx.location.permission} placeholder="Zürich" value={cityQ} onChangeText={searchCity} />
          {cities.map((c) => (
            <Button
              key={c.id}
              kind="secondary"
              title={`${c.name}, ${c.country}`}
              busy={busy}
              onPress={async () => {
                if (await run(() => api<Me>('PUT', '/me/location', { level: 'city', city_id: c.id }))) done();
              }}
            />
          ))}
        </View>
      ) : null}

      {safeWarn ? (
        <View style={{ gap: space.s }}>
          <Banner tone="danger" text={tx.location.safeModeExact} />
          <Button kind="danger" title={tx.location.shareAnyway} busy={busy} onPress={() => { setSafeWarn(false); setConfirming(true); }} />
        </View>
      ) : null}
      {confirming ? <Banner tone="warn" text={tx.location.exactConfirm} /> : null}
      <ErrorText text={err} />
      <Button
        testID="location-apply"
        title={confirming ? tx.common.confirm : tx.common.save}
        kind="trust"
        busy={busy}
        onPress={() => apply(safeOn && confirming)}
      />
    </Sheet>
  );
}
