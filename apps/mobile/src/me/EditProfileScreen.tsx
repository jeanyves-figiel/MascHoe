import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import { useOptions } from '../api/options';
import type { MyProfile, Visibility } from '../api/types';
import { useSession } from '../app/session';
import { opt, tx } from '../i18n/app';
import { availableFor, fieldType, GROUPS, maxLen, optionKey } from '../profile/fieldMeta';
import { color, modeColor, space, type } from '../theme/tokens';
import { Banner, Button, Chip, Chips, ErrorText, Field, Icon, Loading, Section, SectionLabel, Segmented, StickyCta, Toggle } from '../ui';
import { getLocal, setLocal } from './localFields';
import { resharePrivate } from '../chat/engine';
import { PhotoEditor } from './PhotoEditor';
import { ProfileLinks } from './ProfileLinks';

type Nav = { goBack: () => void };
const VIS: Visibility[] = ['public', 'verified', 'chats', 'only_me'];
const kindMode = { now: 'hookup', friends: 'friends', sport: 'sport' } as const;

// S-41 Edit profile (F-06): every field with its own visibility (R-06.4).
export function EditProfileScreen({ route, navigation }: { route: { params: { id: string } }; navigation: Nav }) {
  const { me, refresh } = useSession();
  const options = useOptions();
  const insets = useSafeAreaInsets();
  const initial = (me.profiles ?? []).find((p) => p.id === route.params.id) ?? me.profile!;
  const [p, setP] = useState<MyProfile>(initial);
  const [name, setName] = useState(initial.display_name);
  const [vals, setVals] = useState<Record<string, unknown>>(initial.fields);
  const [vis, setVis] = useState<Record<string, Visibility>>(initial.visibility_map ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string[]>>({});
  const accent = modeColor[kindMode[p.kind]];

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
                <Chip key={c} label={opt(c)} on={cur.includes(c)} fill={accent} onPress={() => set(k, cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c])} />
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
                <Chip key={c} label={opt(c)} on={v === c} fill={accent} onPress={() => set(k, v === c ? null : c)} />
              ))}
            </Chips>
          </View>
        );
    }
  };

  const visRow = (k: string) => {
    const health = options.health.includes(k);
    return (
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: space.xs }}>
          <Icon.Lock size={12} />
          <Text style={{ ...type.caption, color: color.trust }}>{tx.edit.visibility}</Text>
        </View>
        <Segmented
          grow
          label={tx.edit.visibility}
          value={visOf(k)}
          onChange={(x) => setVis((cur) => ({ ...cur, [k]: x }))}
          fills={{ public: color.trust, verified: color.trust, chats: color.trust, only_me: color.trust }}
          options={VIS.filter((x) => !(health && x === 'public')).map((x) => ({ value: x, label: tx.edit.vis[x] }))}
        />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.xl, paddingBottom: 150, maxWidth: 560, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={{ ...type.display, color: color.fgPrimary }}>
          {tx.edit.title}
        </Text>
        <PhotoEditor profile={p} accent={accent} onChange={setP} />
        <Field label={tx.edit.name} value={name} onChangeText={setName} maxLength={30} />
        {GROUPS.map(({ group, keys }) => {
          const ks = keys.filter((k) => availableFor(options.defaults[k]?.kinds, p.kind));
          if (!ks.length) return null;
          return (
            <View key={group} style={{ gap: space.m }}>
              <Text accessibilityRole="header" style={{ ...type.title, color: color.fgPrimary, marginTop: space.s }}>
                {tx.profile.sections[group]}
              </Text>
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
        <ErrorText text={err} />
      </ScrollView>
      <StickyCta>
        <View style={{ paddingBottom: insets.bottom ? insets.bottom - space.m : 0 }}>
          <Button testID="edit-save" title={tx.common.save} fill={color.fgPrimary} busy={busy} onPress={save} />
        </View>
      </StickyCta>
    </View>
  );
}
