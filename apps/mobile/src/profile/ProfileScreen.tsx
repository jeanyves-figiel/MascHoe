import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import type { MyProfile, ProfileView, Visibility } from '../api/types';
import { useSession } from '../app/session';
import { distanceLabel, tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { Badge, Banner, Button, ErrorState, Loading, Photo, Sheet, useAccent, VerifiedTick } from '../ui';
import { getLocal } from '../me/localFields';
import { FieldList } from './FieldList';
import { PrivateNote } from './PrivateNote';
import { getConvs } from '../chat/engine';

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void };
type Params = { id: string; preview?: 'stranger' | 'verified' | 'chats' };

/** Preview-as (R-06.9): own profile filtered the way the chosen audience sees it. */
export function previewOf(p: MyProfile, as: 'stranger' | 'verified' | 'chats', local: Record<string, unknown>, verified: boolean): ProfileView {
  const allowed: Visibility[] = as === 'stranger' ? ['public'] : as === 'verified' ? ['public', 'verified'] : ['public', 'verified', 'chats'];
  const all = { ...p.fields, ...(as === 'chats' ? local : {}) };
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    const vis = p.visibility_map[k] ?? 'public';
    if (allowed.includes(vis)) fields[k] = v;
  }
  return {
    id: p.id,
    kind: p.kind,
    display_name: p.display_name,
    age: p.age,
    gender: p.gender,
    gender_other: p.gender_other,
    fields,
    photos: p.photos.filter((x) => x.url && x.status !== 'rejected').map((x) => x.url!),
    verified,
    verified_since: null,
    member_since: new Date().toISOString(),
    now: null,
    distance: null,
    tapped: false,
    tapped_me: false,
    vouches: 0,
    badges: [],
    linked_accounts: [],
    self: true,
  };
}

// S-20 profile view (F-06). R-04.9: blocked / unavailable → "Not available".
export function ProfileScreen({ route, navigation }: { route: { params: Params }; navigation: Nav }) {
  const { id, preview } = route.params;
  const { me } = useSession();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const [remote, setP] = useState<ProfileView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const width = Math.min(Dimensions.get('window').width, 560);

  const [nowTs] = useState(() => Date.now());
  const [local, setLocal] = useState<Record<string, unknown>>({});
  const own = preview ? (me.profiles ?? []).find((x) => x.id === id) : undefined;
  const previewView = useMemo(() => (own && preview ? previewOf(own, preview, local, me.verified) : null), [own, preview, local, me.verified]);

  const load = useCallback(
    () =>
      preview
        ? getLocal(id).then(setLocal)
        : api<ProfileView>('GET', `/profiles/${id}`).then(
            (v) => {
              setErr(null);
              setP(v);
            },
            (e) => {
              if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setGone(true);
              else setErr(e instanceof ApiError ? e.message : tx.common.error);
            },
          ),
    [id, preview],
  );

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : tx.common.error);
    } finally {
      setBusy(false);
    }
  };

  if (gone)
    return (
      <View style={{ flex: 1, backgroundColor: color.bgBase, justifyContent: 'center', alignItems: 'center', gap: space.l }}>
        <Text style={{ ...type.title, color: color.fgPrimary }}>{tx.profile.unavailable}</Text>
        <Button kind="secondary" title={tx.common.back} onPress={navigation.goBack} />
      </View>
    );
  if (err) return <ErrorState text={err} retry={tx.common.retry} onRetry={load} />;
  const p = previewView ?? remote;
  if (!p) return <Loading />;

  const photos = p.photos.length ? p.photos : [null];
  const years = Math.floor((nowTs - new Date(p.member_since).getTime()) / (365.25 * 86400000));

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <FlatList
          horizontal
          pagingEnabled
          data={photos}
          keyExtractor={(_, i) => String(i)}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Photo uri={item} id={p.id + index} label={`${p.display_name} photo ${index + 1}`} style={{ width, height: width * 1.25 }} />
          )}
        />
        <View style={{ padding: space.l, gap: space.m, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
          {preview ? <Banner tone="personal" text={`${tx.me.previewAs}: ${tx.me.previews[preview]}`} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <Text style={{ ...type.display, color: color.fgPrimary, flexShrink: 1 }}>
              {p.display_name}, {p.age}
            </Text>
            {p.verified ? <VerifiedTick size={22} /> : null}
          </View>
          <Text style={{ ...type.meta, color: color.fgSecondary }}>
            {[distanceLabel(p.distance), p.fields.pronouns as string | undefined, tx.profile.memberSince(years)].filter(Boolean).join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {p.now ? <Badge label={tx.now[p.now.status] + (p.now.text ? ` · ${p.now.text}` : '')} fill={accent} /> : null}
            {p.tapped_me ? <Badge label={tx.profile.tappedYou} fill={color.personal} /> : null}
            {p.verified_since ? <Badge label={tx.profile.verifiedSince(new Date(p.verified_since).toLocaleDateString())} fill={color.trust} /> : null}
            {p.vouches > 0 ? <Badge label={tx.profile.vouches(p.vouches)} fill={color.friends} /> : null}
            {p.badges
              .filter((b) => b.kind === 'host_rating')
              .map((b) => (
                <Badge key={b.kind} label={tx.profile.hostRating(b.up_pct ?? 0, b.total ?? 0)} fill={color.hookup} />
              ))}
          </View>
          {p.tapped && p.tapped_me ? <Banner tone="personal" text={tx.profile.mutual} /> : null}
          <FieldList fields={{ ...p.fields, ...(getConvs().find((c) => c.peer === p.id)?.peerFields ?? {}) }} accent={accent} />
          {!p.self && !preview ? <PrivateNote profileId={p.id} /> : null}
        </View>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tx.common.back}
        onPress={navigation.goBack}
        style={{ position: 'absolute', top: insets.top + space.s, left: space.l, width: 44, height: 44, borderRadius: 22, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: color.fgPrimary, fontSize: 22 }}>‹</Text>
      </Pressable>
      {!p.self ? (
        <Pressable
          testID="profile-menu"
          accessibilityRole="button"
          accessibilityLabel={tx.profile.menu}
          onPress={() => setMenu(true)}
          style={{ position: 'absolute', top: insets.top + space.s, right: space.l, width: 44, height: 44, borderRadius: 22, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: color.fgPrimary, fontSize: 20 }}>⋯</Text>
        </Pressable>
      ) : null}

      {!p.self ? (
        <View style={{ position: 'absolute', left: space.l, right: space.l, bottom: insets.bottom + space.l, flexDirection: 'row', gap: space.s, maxWidth: 560, alignSelf: 'center', width: '100%' }}>
          <View style={{ flex: 1 }}>
            <Button
              testID="tap-btn"
              kind="secondary"
              title={p.tapped ? tx.profile.tapped : tx.profile.tap}
              disabled={p.tapped}
              busy={busy}
              onPress={() => act(() => api('POST', `/profiles/${p.id}/tap`), () => setP({ ...p, tapped: true }))}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Button
              testID="message-btn"
              title={tx.profile.message}
              fill={accent}
              onPress={() => (me.verified ? navigation.navigate('Chat', { profileId: p.id, name: p.display_name }) : setMsg(tx.explore.unverifiedMessage))}
            />
          </View>
        </View>
      ) : null}
      {msg ? (
        <View style={{ position: 'absolute', left: space.l, right: space.l, bottom: insets.bottom + 90 }}>
          <Banner tone="warn" text={msg} onPress={() => (me.verified ? setMsg(null) : navigation.navigate('Verify'))} />
        </View>
      ) : null}

      <Sheet visible={menu} onClose={() => { setMenu(false); setConfirmBlock(false); }} title={p.display_name} closeLabel={tx.common.close}>
        {confirmBlock ? (
          <View style={{ gap: space.m }}>
            <Text style={{ ...type.body, color: color.fgPrimary }}>{tx.profile.blockConfirm}</Text>
            <Button
              testID="block-confirm"
              kind="danger"
              title={tx.profile.block}
              busy={busy}
              onPress={() => act(() => api('POST', `/profiles/${p.id}/block`), () => { setMenu(false); navigation.goBack(); })}
            />
          </View>
        ) : (
          <View style={{ borderRadius: radius.md }}>
            {[
              { label: tx.profile.share, on: () => Share.share({ message: `https://thirstr.fun/p/${p.id}` }).catch(() => {}) },
              { label: tx.profile.hide, on: () => act(() => api('POST', `/profiles/${p.id}/hide`), () => { setMenu(false); navigation.goBack(); }) },
              ...(p.vouched || p.can_vouch
                ? [{ label: p.vouched ? tx.profile.unvouch : tx.profile.vouch, on: () => act(() => api(p.vouched ? 'DELETE' : 'POST', `/profiles/${p.id}/vouch`), () => { setMenu(false); load(); }) }]
                : []),
              { label: tx.profile.report, on: () => { setMenu(false); navigation.navigate('Report', { profileId: p.id }); } },
              { label: tx.profile.block, on: () => setConfirmBlock(true), danger: true },
            ].map((r) => (
              <Pressable key={r.label} accessibilityRole="button" onPress={r.on} style={{ paddingVertical: space.m }}>
                <Text style={{ ...type.headline, color: r.danger ? color.danger : color.fgPrimary }}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Sheet>
    </View>
  );
}
