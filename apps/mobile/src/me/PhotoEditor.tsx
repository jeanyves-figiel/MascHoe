import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError, Me, Photo as P, putBlob } from '../api/client';
import type { MyProfile } from '../api/types';
import { tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { Banner, ErrorText, Icon, Meta, Photo } from '../ui';

const G = space.s;

type Upload = { photo_id: string; put_url: string; content_type: string };

// F-06 photos: slot 0 = vanilla main (R-06.2), 4 extra; reorder, replace, remove.
export function PhotoEditor({ profile, accent, onChange }: { profile: MyProfile; accent: string; onChange: (p: MyProfile) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [w, setW] = useState(0);
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
  // App v2 mosaic (issue 63): main photo 2×2, two on the right, two wide below.
  const c = (w - G * 2) / 3;
  const h = c * 1.05;
  const half = (w - G) / 2;
  const frames = [
    { left: 0, top: 0, width: c * 2 + G, height: h * 2 + G },
    { left: c * 2 + G * 2, top: 0, width: c, height: h },
    { left: c * 2 + G * 2, top: h + G, width: c, height: h },
    { left: 0, top: (h + G) * 2, width: half, height: h },
    { left: half + G, top: (h + G) * 2, width: half, height: h },
  ];

  return (
    <View style={{ gap: space.s }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: w ? h * 3 + G * 2 : 0 }}>
        {w
          ? frames.map((f, i) => {
              const ph = live[i];
              if (!ph)
                return (
                  <Pressable
                    key={`add${i}`}
                    testID={i === live.length ? 'photo-add' : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={tx.edit.add}
                    disabled={freeSlot === undefined || busy !== null}
                    onPress={() => freeSlot !== undefined && add(freeSlot)}
                    style={{ position: 'absolute', ...f, borderRadius: i === 0 ? 22 : 18, borderWidth: 2, borderStyle: 'dashed', borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {busy !== null && i === live.length ? <Text style={{ ...type.title, color: color.fgSecondary }}>…</Text> : <Icon.Plus c={color.fgMuted} />}
                  </Pressable>
                );
              return (
                <Pressable
                  key={ph.id}
                  accessibilityRole="button"
                  accessibilityLabel={i === 0 ? tx.edit.photoMain : `Photo ${i + 1}`}
                  onPress={() => setSel(sel === ph.id ? null : ph.id)}
                  style={{ position: 'absolute', ...f, borderRadius: i === 0 ? 22 : 18, borderWidth: 3, borderColor: sel === ph.id ? accent : 'transparent', overflow: 'hidden' }}
                >
                  <Photo uri={ph.url} id={ph.id} label="" style={{ width: '100%', height: '100%' }} />
                  {i === 0 || ph.status === 'pending' ? (
                    <View style={{ position: 'absolute', left: 8, bottom: 8, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: ph.status === 'pending' ? color.personal : color.bgInverse, justifyContent: 'center' }}>
                      <Text style={{ ...type.caption, color: color.onAccent }}>{ph.status === 'pending' ? tx.edit.pending : tx.edit.photoMain}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })
          : null}
      </View>
      <Meta>{tx.edit.photosHint}</Meta>
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
    <Pressable accessibilityRole="button" onPress={onPress} style={{ height: 40, justifyContent: 'center', paddingHorizontal: space.l, borderRadius: radius.pill, backgroundColor: color.bgRaised }}>
      <Text style={{ ...type.meta, fontSize: 15, fontFamily: type.headline.fontFamily, color: danger ? color.danger : color.fgPrimary }}>{label}</Text>
    </Pressable>
  );
}
