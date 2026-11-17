import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError, Me, Photo as P, putBlob } from '../api/client';
import type { MyProfile } from '../api/types';
import { tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { Banner, ErrorText, Meta, Photo } from '../ui';

type Upload = { photo_id: string; put_url: string; content_type: string };

// F-06 photos: slot 0 = vanilla main (R-06.2), 4 extra; reorder, replace, remove.
export function PhotoEditor({ profile, accent, onChange }: { profile: MyProfile; accent: string; onChange: (p: MyProfile) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const live = [...profile.photos].filter((x) => x.status !== 'rejected').sort((a, b) => a.slot - b.slot);
  const rejected = profile.photos.find((x) => x.status === 'rejected');

  const reload = async () => {
    const r = await api<{ profiles: MyProfile[] }>('GET', '/me/profiles');
    const p = r.profiles.find((x) => x.id === profile.id);
    if (p) onChange(p);
  };

  async function add(slot: number) {
    setErr(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [4, 5] });
    if (r.canceled) return;
    setBusy(slot);
    try {
      const asset = r.assets[0];
      const ct = asset.mimeType ?? 'image/jpeg';
      const up = await api<Upload>('POST', `/me/profiles/${profile.id}/photos`, { slot, content_type: ct });
      await putBlob(up.put_url, asset.uri, ct);
      await api<{ photo: P; account: Me }>('POST', `/me/profiles/${profile.id}/photos/${up.photo_id}/check`);
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tx.common.error);
    } finally {
      setBusy(null);
    }
  }

  async function order(ids: string[]) {
    setErr(null);
    try {
      onChange(await api<MyProfile>('PUT', `/me/profiles/${profile.id}/photos/order`, { order: ids }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tx.common.error);
    }
  }

  async function remove(id: string) {
    setErr(null);
    try {
      await api('DELETE', `/me/profiles/${profile.id}/photos/${id}`);
      setSel(null);
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tx.common.error);
    }
  }

  const ids = live.map((x) => x.id);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    const n = [...ids];
    [n[i], n[j]] = [n[j], n[i]];
    order(n);
  };
  const selIdx = sel ? ids.indexOf(sel) : -1;
  const selected = selIdx >= 0 ? live[selIdx] : null;
  const freeSlot = [0, 1, 2, 3, 4].find((s) => !live.some((x) => x.slot === s));

  return (
    <View style={{ gap: space.s }}>
      <Meta>{tx.edit.photosHint}</Meta>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {live.map((ph, i) => (
          <Pressable
            key={ph.id}
            accessibilityRole="button"
            accessibilityLabel={i === 0 ? tx.edit.photoMain : `Photo ${i + 1}`}
            onPress={() => setSel(sel === ph.id ? null : ph.id)}
            style={{ width: 96, borderRadius: radius.sm, borderWidth: 3, borderColor: sel === ph.id ? accent : i === 0 ? color.trust : 'transparent', overflow: 'hidden' }}
          >
            <Photo uri={ph.url} id={ph.id} label="" style={{ width: '100%', aspectRatio: 4 / 5 }} />
            {i === 0 || ph.status === 'pending' ? (
              <Text style={{ ...type.caption, color: color.onAccent, backgroundColor: i === 0 ? color.trust : color.personal, textAlign: 'center', paddingVertical: 2 }}>
                {ph.status === 'pending' ? tx.edit.pending : tx.edit.photoMain}
              </Text>
            ) : null}
          </Pressable>
        ))}
        {freeSlot !== undefined ? (
          <Pressable
            testID="photo-add"
            accessibilityRole="button"
            accessibilityLabel={tx.edit.add}
            onPress={() => add(freeSlot)}
            style={{ width: 96, aspectRatio: 4 / 5, borderRadius: radius.sm, borderWidth: 2, borderStyle: 'dashed', borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ ...type.title, color: color.fgSecondary }}>{busy !== null ? '…' : '+'}</Text>
          </Pressable>
        ) : null}
      </View>
      {selected ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {selIdx > 0 && selected.main_ok ? <Act label={tx.edit.makeMain} onPress={() => order([selected.id, ...ids.filter((x) => x !== selected.id)])} /> : null}
          {selIdx > 1 || (selIdx === 1 && selected.main_ok) ? <Act label={tx.edit.moveLeft} onPress={() => move(selIdx, -1)} /> : null}
          {selIdx > 0 && selIdx < ids.length - 1 ? <Act label={tx.edit.moveRight} onPress={() => move(selIdx, 1)} /> : null}
          {selIdx > 0 ? <Act label={tx.edit.remove} danger onPress={() => remove(selected.id)} /> : null}
        </View>
      ) : null}
      {busy !== null ? <Banner text={tx.edit.checking} /> : null}
      {rejected ? <Banner tone="danger" text={tx.edit.rejected[rejected.reject_reason ?? ''] ?? tx.common.error} /> : null}
      <ErrorText text={err} />
    </View>
  );
}

function Act({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: 999, borderWidth: 1, borderColor: danger ? color.danger : color.line }}>
      <Text style={{ ...type.meta, color: danger ? color.danger : color.fgPrimary }}>{label}</Text>
    </Pressable>
  );
}
