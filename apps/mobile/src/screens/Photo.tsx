import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { api, ApiError, Me, Photo } from '../api/client';
import { t } from '../i18n/strings';
import { color, radius, space } from '../theme/tokens';
import { Banner, Body, Button, ErrorText, H1, Label, Screen } from '../ui';

type Upload = { photo_id: string; put_url: string; content_type: string };

async function upload(profileId: string, slot: number): Promise<{ photo: Photo; account: Me } | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [4, 5] });
  if (r.canceled) return null;
  const asset = r.assets[0];
  const type = asset.mimeType ?? 'image/jpeg';
  const up = await api<Upload>('POST', `/me/profiles/${profileId}/photos`, { slot, content_type: type });
  const blob = await (await fetch(asset.uri)).blob();
  const put = await fetch(up.put_url, { method: 'PUT', headers: { 'content-type': type }, body: blob });
  if (!put.ok) throw new Error('upload failed');
  return api('POST', `/me/profiles/${profileId}/photos/${up.photo_id}/check`);
}

// S-05 (R-02.7): main photo must pass the vanilla check; 4 extra slots skippable.
export function PhotoScreen({ me, onDone }: { me: Me; onDone: (me: Me) => void }) {
  const [main, setMain] = useState<Photo | null>(me.profile?.photos.find((p) => p.slot === 0) ?? null);
  const [extras, setExtras] = useState<Record<number, Photo>>({});
  const [account, setAccount] = useState<Me>(me);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pid = me.profile!.id;

  async function pick(slot: number) {
    setErr(null);
    setBusy(slot);
    try {
      const res = await upload(pid, slot);
      if (!res) return;
      setAccount(res.account);
      if (slot === 0) setMain(res.photo);
      else setExtras({ ...extras, [slot]: res.photo });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  const ok = main?.status === 'ok_main';
  const reason = main?.status === 'rejected' ? (t.photo as any)[main.reject_reason ?? ''] ?? t.errors.generic : null;

  return (
    <Screen progress={4}>
      <H1>{t.photo.title}</H1>
      <Body muted>{t.photo.rule}</Body>
      <View style={{ aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: color.bgRaised, borderWidth: 2, borderColor: ok ? color.safety : reason ? color.danger : color.line }}>
        {main?.url ? <Image source={{ uri: main.url }} style={{ flex: 1 }} accessibilityLabel="Main photo" /> : null}
      </View>
      {busy === 0 ? <Banner text={t.photo.checking} /> : ok ? <Banner text={t.photo.ok} tone="trust" /> : reason ? <Banner text={reason} tone="danger" /> : null}
      <Button testID="pick-main" title={t.photo.pick} kind={ok ? 'secondary' : 'primary'} busy={busy === 0} onPress={() => pick(0)} />
      {ok ? (
        <>
          <Label>{t.photo.extra}</Label>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {[1, 2, 3, 4].map((slot) => (
              <View key={slot} style={{ flex: 1 }}>
                {extras[slot]?.url ? (
                  <Image source={{ uri: extras[slot].url! }} style={{ aspectRatio: 4 / 5, borderRadius: radius.md }} />
                ) : (
                  <Button title="+" kind="secondary" busy={busy === slot} onPress={() => pick(slot)} />
                )}
              </View>
            ))}
          </View>
        </>
      ) : null}
      <ErrorText text={err} />
      <Button testID="photo-continue" title={t.photo.continue} disabled={!ok} onPress={() => onDone(account)} />
    </Screen>
  );
}
