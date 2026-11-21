import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import type { Mode, MyProfile, ProfileView, Visibility } from '../api/types';
import { useSession } from '../app/session';
import { distanceLabel, tx } from '../i18n/app';
import { color, font, modeColor, radius, space, type } from '../theme/tokens';
import { v3 } from '../i18n/v3';
import { AUDIENCES, allowedFor, cycle } from '../me/look';
import { Badge, Banner, Button, ErrorState, Icon, Loading, Photo, Scrim, Section, Sheet, useAccent, VerifiedTick } from '../ui';
import { getLocal } from '../me/localFields';
import { FieldList } from './FieldList';
import { PrivateNote } from './PrivateNote';
import { getConvs } from '../chat/engine';
import { LENSES, lensFields, lensPhoto } from './lens';

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void; setParams?: (p: Partial<Params>) => void };
type Params = { id: string; preview?: 'stranger' | 'verified' | 'chats'; mode?: Mode };

/** Preview-as (R-06.7): own profile filtered the way the chosen audience sees it through a lens. */
export function previewOf(p: MyProfile, as: 'stranger' | 'verified' | 'chats', local: Record<string, unknown>, verified: boolean, mode: Mode = 'hookup'): ProfileView {
  const allowed: Visibility[] = allowedFor(as);
  const all = { ...p.fields, ...(as === 'chats' ? local : {}) };
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    const vis = p.visibility_map[k] ?? 'public';
    if (allowed.includes(vis)) fields[k] = v;
  }
  const shown = lensFields(fields, mode);
  return {
    id: p.id,
    kind: p.kind,
    display_name: p.display_name,
    age: p.age,
    gender: p.gender,
    gender_other: p.gender_other,
    fields: shown,
    photos: p.photos.filter((x) => x.url && x.status !== 'rejected' && lensPhoto(x, mode)).map((x) => x.url!),
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
  const { me, mode: appMode } = useSession();
  // F-06 R-06.1b: others are seen through the current mode's lens.
  const mode = route.params.mode ?? appMode;
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
  const [page, setPage] = useState(0);
  const [solid, setSolid] = useState(false);

  const [nowTs] = useState(() => Date.now());
  const [local, setLocal] = useState<Record<string, unknown>>({});
  const own = preview ? (me.profiles ?? []).find((x) => x.id === id) : undefined;
  const previewView = useMemo(() => (own && preview ? previewOf(own, preview, local, me.verified, mode) : null), [own, preview, local, me.verified, mode]);

  const load = useCallback(
    () =>
      preview
        ? getLocal(id).then(setLocal)
        : api<ProfileView>('GET', `/profiles/${id}?mode=${mode}`).then(
            (v) => {
              setErr(null);
              setP(v);
            },
            (e) => {
              if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setGone(true);
              else setErr(e instanceof ApiError ? e.message : tx.common.error);
            },
          ),
    [id, preview, mode],
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
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > width * 1.33 - 140;
          if (past !== solid) setSolid(past);
        }}
      >
        <View>
          <FlatList
            horizontal
            pagingEnabled
            data={photos}
            keyExtractor={(_, i) => String(i)}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item, index }) => (
              <Photo uri={item} id={p.id + index} label={`${p.display_name}'s photo ${index + 1} of ${photos.length}`} style={{ width, height: width * 1.33 }} />
            )}
          />
          <Scrim height={160} max={1} steps={12} />
          {photos.length > 1 ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 4, left: space.l, right: space.l, flexDirection: 'row', gap: 4 }}>
              {photos.map((_, i) => (
                <View key={i} style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: color.fgPrimary, opacity: i === page ? 1 : 0.35 }} />
              ))}
            </View>
          ) : null}
        </View>
        <View style={{ marginTop: -64, paddingHorizontal: space.xl, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
          {preview ? (
            // #114 full-screen preview: "Seen by <viewer> in <lens>", each pill cycles.
            <View testID="preview-pills" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 4, paddingLeft: 12, borderRadius: radius.pill, backgroundColor: color.scrim }}>
              <Text style={{ ...type.meta, color: color.fgSecondary }}>{v3.look.seenBy}</Text>
              <Pressable testID="preview-aud" accessibilityRole="button" onPress={() => navigation.setParams?.({ preview: cycle(AUDIENCES, preview) })} style={{ height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.bgInverse, justifyContent: 'center' }}>
                <Text style={{ ...type.meta, fontFamily: font.heavy, color: color.onAccent }}>{v3.look.aud[preview]} ▾</Text>
              </Pressable>
              <Text style={{ ...type.meta, color: color.fgSecondary }}>{v3.look.in}</Text>
              <Pressable testID="preview-lens" accessibilityRole="button" onPress={() => navigation.setParams?.({ mode: cycle(LENSES, mode) })} style={{ height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: modeColor[mode], justifyContent: 'center' }}>
                <Text style={{ ...type.meta, fontFamily: font.heavy, color: color.onAccent }}>{tx.modes[mode]} ▾</Text>
              </Pressable>
            </View>
          ) : null}
          {preview && own && !(own.show_in ?? ['hookup']).includes(mode) ? <Banner tone="warn" text={v3.look.off(tx.modes[mode])} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <Text style={{ ...type.display, fontSize: 34, lineHeight: 38, color: color.fgPrimary, flexShrink: 1 }} accessibilityRole="header">
              {p.display_name}, {p.age}
            </Text>
            {p.verified ? <VerifiedTick size={24} /> : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {p.distance ? <Chip text={distanceLabel(p.distance)} fg={color.trust} /> : null}
            {p.fields.pronouns ? <Chip text={String(p.fields.pronouns)} /> : null}
            <Chip text={tx.profile.memberSince(years)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
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
          {p.linked_accounts.length ? (
            <View testID="profile-linked" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {p.linked_accounts.map((l) => (
                <Pressable key={l.platform + l.handle} accessibilityRole="link" onPress={() => l.url && Linking.openURL(l.url)}>
                  <Badge label={`${tx.linked.platforms[l.platform] ?? l.platform} @${l.handle}${l.verified ? ` · ${tx.profile.linkedVerified}` : ''}`} fill={color.fgSoft} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {p.tapped && p.tapped_me ? <Banner tone="personal" text={tx.profile.mutual} /> : null}
          <FieldList fields={{ ...p.fields, ...(getConvs().find((c) => c.peer === p.id)?.peerFields ?? {}) }} accent={accent} />
          {!p.self && !preview ? <PrivateNote profileId={p.id} /> : null}
        </View>
      </ScrollView>

      {solid ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 76, backgroundColor: color.bgBase, borderBottomWidth: 1, borderBottomColor: color.line, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 26 }}>
          <Text numberOfLines={1} style={{ ...type.headline, color: color.fgPrimary, maxWidth: '60%' }}>
            {p.display_name}, {p.age}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tx.common.back}
        onPress={navigation.goBack}
        style={{ position: 'absolute', top: insets.top + 16, left: space.l, width: 44, height: 44, borderRadius: 22, backgroundColor: color.bgInverse, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon.Back c={color.onAccent} />
      </Pressable>
      {!p.self ? (
        <Pressable
          testID="profile-menu"
          accessibilityRole="button"
          accessibilityLabel={tx.profile.menu}
          onPress={() => setMenu(true)}
          style={{ position: 'absolute', top: insets.top + 16, right: space.l, width: 44, height: 44, borderRadius: 22, backgroundColor: color.bgInverse, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon.More c={color.onAccent} />
        </Pressable>
      ) : null}

      {!p.self ? (
        <View style={{ position: 'absolute', left: space.l, right: space.l, bottom: insets.bottom + space.l, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            testID="tap-btn"
            accessibilityRole="button"
            accessibilityLabel={p.tapped ? tx.profile.tapped : tx.profile.tap}
            accessibilityState={{ disabled: p.tapped, busy }}
            onPress={p.tapped || busy ? undefined : () => act(() => api('POST', `/profiles/${p.id}/tap`), () => setP({ ...p, tapped: true }))}
            style={({ pressed }) => [{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: p.tapped ? color.personal : color.bgRaised }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <Icon.Star c={p.tapped ? color.onAccent : color.fgPrimary} fill={p.tapped ? color.onAccent : 'none'} />
          </Pressable>
          <View style={{ flex: 1 }}>
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
          <Section>
            {[
              { label: tx.profile.share, icon: Icon.Share, tint: color.friends, on: () => Share.share({ message: `https://thirstr.fun/p/${p.id}` }).catch(() => {}) },
              ...(p.vouched || p.can_vouch
                ? [{ label: p.vouched ? tx.profile.unvouch : tx.profile.vouch, icon: Icon.Shield, tint: color.trust, on: () => act(() => api(p.vouched ? 'DELETE' : 'POST', `/profiles/${p.id}/vouch`), () => { setMenu(false); load(); }) }]
                : []),
              { label: tx.profile.hide, icon: Icon.EyeOff, tint: color.fgSecondary, on: () => act(() => api('POST', `/profiles/${p.id}/hide`), () => { setMenu(false); navigation.goBack(); }) },
              { label: tx.profile.report, icon: Icon.Flag, tint: color.warn, on: () => { setMenu(false); navigation.navigate('Report', { profileId: p.id }); } },
              { label: tx.profile.block, icon: Icon.Ban, tint: color.danger, on: () => setConfirmBlock(true), danger: true },
            ].map((r) => (
              <Pressable key={r.label} accessibilityRole="button" onPress={r.on} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 58, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: `${r.tint}26`, alignItems: 'center', justifyContent: 'center' }}>
                  <r.icon size={19} c={r.tint} />
                </View>
                <Text style={{ ...type.headline, color: r.danger ? color.danger : color.fgPrimary, flex: 1 }}>{r.label}</Text>
              </Pressable>
            ))}
          </Section>
        )}
      </Sheet>
    </View>
  );
}

function Chip({ text, fg = color.fgSecondary }: { text: string; fg?: string }) {
  return (
    <View style={{ paddingHorizontal: space.m, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: color.bgRaised }}>
      <Text style={{ ...type.meta, fontFamily: type.headline.fontFamily, color: fg }}>{text}</Text>
    </View>
  );
}
