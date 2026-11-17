import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { api, ApiError, clearSession, Me } from '../api/client';
import { t } from '../i18n/strings';
import { color, radius, space, type } from '../theme/tokens';
import { Banner, Body, Button, ErrorText, Field, H1, Screen, s } from '../ui';

// S-10 placeholder: browse-only state after "Later" (R-02.8) + Account & data actions (S-64, F-01).
export function ExploreScreen({ me, onChange, onSignedOut }: { me: Me; onChange: (me: Me) => void; onSignedOut: () => void }) {
  const [around, setAround] = useState<{ count: number | null; city: string | null } | null>(null);
  const [confirm, setConfirm] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ count: number | null; city: string | null }>('GET', '/welcome').then(setAround).catch(() => {});
  }, []);
  const main = me.profile?.photos.find((p) => p.slot === 0);

  async function act(fn: () => Promise<void>) {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.errors.generic);
    }
  }

  return (
    <Screen>
      {!me.verified ? <Banner text={t.explore.banner} /> : null}
      {me.status === 'paused' ? <Banner text="Paused: you are hidden everywhere." tone="warn" /> : null}
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: space.m }]}>
        {main?.url ? <Image source={{ uri: main.url }} style={{ width: 64, height: 80, borderRadius: radius.md }} /> : null}
        <View>
          <Text style={{ ...type.headline, color: color.fgPrimary }}>
            {me.profile?.display_name}, {me.profile?.age}
          </Text>
          <Text style={{ ...type.meta, color: color.fgSecondary }}>Location: {me.location?.level ?? '—'}</Text>
        </View>
      </View>
      <H1>{t.explore.around(around?.count ?? null, around?.city ?? null)}</H1>
      <Body muted>{t.explore.placeholder}</Body>
      <View style={s.spacer} />
      {me.status === 'paused' ? (
        <Button title={t.explore.resume} kind="secondary" onPress={() => act(async () => onChange(await api<Me>('POST', '/account/resume')))} />
      ) : (
        <Button title={t.explore.pause} kind="secondary" onPress={() => act(async () => onChange(await api<Me>('POST', '/account/pause')))} />
      )}
      <Button title={t.explore.logoutAll} kind="ghost" onPress={() => act(async () => { await api('POST', '/auth/logout_all'); await clearSession(); onSignedOut(); })} />
      {showDelete ? (
        <>
          <Field label={t.explore.deleteConfirm} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
          <Button title={t.explore.delete} kind="danger" disabled={confirm !== 'DELETE'} onPress={() => act(async () => { await api('DELETE', '/account', { confirm }); await clearSession(); onSignedOut(); })} />
        </>
      ) : (
        <Button title={t.explore.delete} kind="danger" onPress={() => setShowDelete(true)} />
      )}
      <ErrorText text={err} />
    </Screen>
  );
}
