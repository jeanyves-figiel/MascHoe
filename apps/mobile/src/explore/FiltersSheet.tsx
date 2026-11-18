import React, { useState } from 'react';
import { View } from 'react-native';
import { useOptions } from '../api/options';
import type { Mode } from '../api/types';
import { opt, tx } from '../i18n/app';
import { modeColor, space } from '../theme/tokens';
import { Banner, Button, Chip, Chips, Field, Label, Sheet, Toggle } from '../ui';
import { defaultFilters, Filters } from './explore';

const DISTANCES = [1000, 5000, 10000, 25000, 50000];

// Filter groups per mode (R-04.8). Position/hosting need the viewer to be verified (R-06.5).
const GROUPS: Record<Mode, { key: string; verifiedOnly?: boolean }[]> = {
  hookup: [{ key: 'position', verifiedOnly: true }, { key: 'hosting', verifiedOnly: true }, { key: 'tribes' }, { key: 'build' }, { key: 'looking_for' }, { key: 'languages' }],
  friends: [{ key: 'looking_for' }, { key: 'tribes' }, { key: 'languages' }, { key: 'orientation' }],
  sport: [{ key: 'sports' }, { key: 'sport_level' }, { key: 'schedule' }, { key: 'sport_intent' }, { key: 'languages' }],
};

export function FiltersSheet({
  visible,
  mode,
  verified,
  value,
  onClose,
  onApply,
}: {
  visible: boolean;
  mode: Mode;
  verified: boolean;
  value: Filters;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const options = useOptions();
  const [f, setF] = useState<Filters>(value);
  // Reset the draft whenever the sheet opens or the saved filters change.
  const [seen, setSeen] = useState({ value, visible });
  if (seen.value !== value || seen.visible !== visible) {
    setSeen({ value, visible });
    setF(value);
  }
  const fill = modeColor[mode];
  const set = (k: string, v: unknown) => setF((cur) => ({ ...cur, [k]: v }));
  const toggleIn = (k: string, v: string) => {
    const cur = (f[k] as string[] | undefined) ?? [];
    set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  const num = (s: string) => (s.trim() === '' ? undefined : Number.parseInt(s, 10) || undefined);

  return (
    <Sheet visible={visible} onClose={onClose} title={tx.filters.title} closeLabel={tx.common.close}>
      <Label>{tx.filters.age}</Label>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <View style={{ flex: 1 }}>
          <Field label="Min" keyboardType="number-pad" value={f.age_min ? String(f.age_min) : ''} onChangeText={(s) => set('age_min', num(s))} placeholder="18" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Max" keyboardType="number-pad" value={f.age_max ? String(f.age_max) : ''} onChangeText={(s) => set('age_max', num(s))} placeholder="99" />
        </View>
      </View>
      <Label>{tx.filters.distance}</Label>
      <Chips>
        <Chip label={tx.filters.any} on={!f.distance_max} onPress={() => set('distance_max', undefined)} fill={fill} />
        {DISTANCES.map((d) => (
          <Chip key={d} label={`${d / 1000} km`} on={f.distance_max === d} onPress={() => set('distance_max', d)} fill={fill} />
        ))}
      </Chips>
      <Toggle label={tx.filters.verifiedOnly} value={f.verified_only} onChange={(v) => set('verified_only', v)} tone={fill} />
      <Toggle label={tx.filters.onlineNow} value={f.online_now} onChange={(v) => set('online_now', v)} tone={fill} />
      {mode === 'hookup' ? <Toggle label={tx.filters.hasNow} value={f.has_now} onChange={(v) => set('has_now', v)} tone={fill} /> : null}
      <Toggle label={tx.filters.hideCreators} value={f.hide_creators} onChange={(v) => set('hide_creators', v)} tone={fill} />
      <Toggle label={tx.filters.newMembers} value={f.new_members} onChange={(v) => set('new_members', v)} tone={fill} />
      {!verified && mode === 'hookup' ? <Banner tone="warn" text={tx.filters.verifiedHint} /> : null}
      {options
        ? GROUPS[mode].map(({ key, verifiedOnly }) =>
            verifiedOnly && !verified ? null : (
              <View key={key} style={{ gap: space.xs }}>
                <Label>{tx.edit.fields[key] ?? key}</Label>
                <Chips>
                  {(options.options[key] ?? []).map((v) => (
                    <Chip key={v} label={opt(v, key)} on={((f[key] as string[] | undefined) ?? []).includes(v)} onPress={() => toggleIn(key, v)} fill={fill} />
                  ))}
                </Chips>
              </View>
            ),
          )
        : null}
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" title={tx.filters.reset} onPress={() => setF(defaultFilters)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button testID="filters-apply" title={tx.filters.apply} fill={fill} onPress={() => onApply(f)} />
        </View>
      </View>
    </Sheet>
  );
}
