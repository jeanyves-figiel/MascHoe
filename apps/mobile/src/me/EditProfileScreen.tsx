import { NAME_MAX } from '../onboarding/flow';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api, ApiError } from '../api/client';
import { useOptions } from '../api/options';
import type { MyProfile, Visibility } from '../api/types';
import { useSession } from '../app/session';
import { opt, tx } from '../i18n/app';
import { fieldType, GROUPS, maxLen, optionKey } from '../profile/fieldMeta';
import { color, font, modeColor, radius, space, type } from '../theme/tokens';
import { Banner, Button, Chip, Chips, ErrorText, Field, Icon, Loading, Section, SectionLabel, Sheet, StickyCta, Toggle } from '../ui';
import { getLocal, setLocal } from './localFields';
import { resharePrivate } from '../chat/engine';
import { PhotoEditor } from './PhotoEditor';
import { ProfileLinks } from './ProfileLinks';

type Nav = { goBack: () => void };
type Params = { id: string; focus?: 'sport' };
const VIS: Visibility[] = ['public', 'verified', 'chats', 'only_me'];

// S-41 Edit profile (F-06): every field with its own visibility (R-06.4).
export function EditProfileScreen({ route, navigation }: { route: { params: Params }; navigation: Nav }) {
  const { me, refresh, mode } = useSession();
  const options = useOptions();
  const initial = (me.profiles ?? []).find((p) => p.id === route.params.id) ?? me.profile!;
  const [p, setP] = useState<MyProfile>(initial);
  const [name, setName] = useState(initial.display_name);
  const [vals, setVals] = useState<Record<string, unknown>>(initial.fields);
  const [vis, setVis] = useState<Record<string, Visibility>>(initial.visibility_map ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string[]>>({});
  const [visFor, setVisFor] = useState<string | null>(null);
  const accent = modeColor[route.params.focus ?? mode];
  // Turning Sport on in Me opens here at the sport fields (F-11 R-11.1 mini-setup).
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [focusY, setFocusY] = useState<number | null>(null);
  useEffect(() => {
    if (focusY !== null) scroll.current?.scrollTo({ y: focusY, animated: true });
  }, [focusY]);

  useEffect(() => {
    getLocal(p.id).then((l) => setVals((v) => ({ ...v, ...l })));
  }, [p.id]);

  if (!options) return <Loading />;

  const visOf = (k: string): Visibility => vis[k] ?? options.defaults[k]?.visibility ?? 'public';
  const set = (k: string, v: unknown) => setVals((cur) => ({ ...cur, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    setFieldErr({});
    const server: Record<string, unknown> = {};
    const local: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(vals)) {
      if (!options!.defaults[k]) continue;
      if (['chats', 'only_me'].includes(visOf(k))) local[k] = v;
      else server[k] = v === undefined ? null : v;
    }
    // Clear on the server anything that moved to device-only.
    for (const k of Object.keys(local)) server[k] = null;
    try {
      await setLocal(p.id, local);
      resharePrivate(p.id).catch(() => {});
      await api('PATCH', `/me/profiles/${p.id}`, { display_name: name.trim(), fields: server, visibility_map: vis });
      await refresh();
      navigation.goBack();
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
        setFieldErr(e.fields ?? {});
      } else setErr(tx.common.error);
    } finally {
      setBusy(false);
    }
  }

  const input = (k: string) => {
    const t = fieldType(k);
    const v = vals[k];
    const choices = options.options[optionKey(k)] ?? [];
    switch (t) {
      case 'bool':
        return (
          <Section>
            <Toggle label={tx.edit.fields[k] ?? k} value={!!v} onChange={(x) => set(k, x)} tone={accent} />
          </Section>
        );
      case 'text':
        return <Field label={tx.edit.fields[k] ?? k} value={(v as string) ?? ''} onChangeText={(x) => set(k, x)} maxLength={maxLen(k)} multiline={maxLen(k) > 60} error={fieldErr[k]?.[0]} />;
      case 'int':
        return <Field label={tx.edit.fields[k] ?? k} keyboardType="number-pad" value={v ? String(v) : ''} onChangeText={(x) => set(k, x ? Number.parseInt(x, 10) || null : null)} error={fieldErr[k]?.[0]} />;
      case 'month':
        return <Field label={tx.edit.fields[k] ?? k} value={(v as string) ?? ''} placeholder="2026-10" onChangeText={(x) => set(k, x)} error={fieldErr[k]?.[0]} />;
      case 'multi': {
        const cur = (v as string[]) ?? [];
        return (
          <View style={{ gap: space.s }}>
            <SectionLabel>{tx.edit.fields[k] ?? k}</SectionLabel>
            <Chips>
              {choices.map((c) => (
                <Chip key={c} label={opt(c, k)} on={cur.includes(c)} fill={accent} onPress={() => set(k, cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c])} />
              ))}
            </Chips>
          </View>
        );
      }
      default:
        return (
          <View style={{ gap: space.s }}>
            <SectionLabel>{tx.edit.fields[k] ?? k}</SectionLabel>
            <Chips>
              {choices.map((c) => (
                <Chip key={c} label={opt(c, k)} on={v === c} fill={accent} onPress={() => set(k, v === c ? null : c)} />
              ))}
            </Chips>
          </View>
        );
    }
  };

  // Compact "who sees this" pill; the choice opens in one shared sheet (issue 71).
  const visRow = (k: string) => (
    <Pressable
      testID={`vis-${k}`}
      accessibilityRole="button"
      accessibilityLabel={`${tx.edit.visibility}: ${tx.edit.vis[visOf(k)]}`}
      onPress={() => setVisFor(k)}
      style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 32, paddingHorizontal: space.m, borderRadius: radius.pill, backgroundColor: `${color.trust}1A` }}
    >
      <Icon.Lock size={12} />
      <Text style={{ ...type.meta, fontFamily: font.bold, color: color.trust }}>{tx.edit.vis[visOf(k)]}</Text>
      <Icon.Next size={13} c={color.trust} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      <ScrollView keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets ref={scroll} contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.xl, paddingBottom: 220, maxWidth: 560, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={{ ...type.display, color: color.fgPrimary }}>
          {tx.edit.title}
        </Text>
        <PhotoEditor profile={p} accent={accent} onChange={setP} />
        <Field label={tx.edit.name} value={name} onChangeText={setName} maxLength={NAME_MAX} />
        {GROUPS.map(({ group, keys }) => {
          const ks = keys.filter((k) => options.defaults[k]);
          if (!ks.length) return null;
          const caption = tx.edit.lensCaption[group];
          return (
            <View key={group} style={{ gap: space.m }} onLayout={group === 'sport' && route.params.focus === 'sport' ? (e) => setFocusY(e.nativeEvent.layout.y) : undefined}>
              <View style={{ gap: 2, marginTop: space.s }}>
                <Text accessibilityRole="header" style={{ ...type.title, color: color.fgPrimary }}>
                  {tx.profile.sections[group]}
                </Text>
                {caption ? <Text style={{ ...type.meta, color: group === 'sport' ? color.sport : color.hookup }}>{caption}</Text> : null}
              </View>
              {group === 'health' ? <Banner tone="trust" text={tx.edit.healthNote} /> : null}
              {ks.map((k) => (
                <View key={k} style={{ gap: space.s, paddingBottom: space.m, borderBottomWidth: 1, borderBottomColor: color.lineSubtle }}>
                  {input(k)}
                  {visRow(k)}
                  {['chats', 'only_me'].includes(visOf(k)) && group !== 'health' ? <Text style={{ ...type.meta, color: color.fgMuted, marginLeft: space.xs }}>{tx.edit.chatsNote}</Text> : null}
                </View>
              ))}
            </View>
          );
        })}
        <ProfileLinks profileId={p.id} />
        <Sheet visible={!!visFor} onClose={() => setVisFor(null)} title={tx.edit.visibility} closeLabel={tx.common.close}>
          {visFor ? (
            <Section>
              {VIS.filter((x) => !(options.health.includes(visFor) && x === 'public')).map((x) => (
                <Pressable
                  key={x}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: visOf(visFor) === x }}
                  onPress={() => {
                    setVis((cur) => ({ ...cur, [visFor]: x }));
                    setVisFor(null);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56 }}
                >
                  <Text style={{ ...type.headline, fontFamily: font.bold, color: color.fgPrimary, flex: 1 }}>{tx.edit.vis[x]}</Text>
                  {visOf(visFor) === x ? (
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color.trust, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon.Check size={14} />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </Section>
          ) : null}
        </Sheet>
        <ErrorText text={err} />
      </ScrollView>
      <StickyCta>
        <Button testID="edit-save" title={tx.common.save} fill={color.fgPrimary} busy={busy} onPress={save} />
      </StickyCta>
    </View>
  );
}
