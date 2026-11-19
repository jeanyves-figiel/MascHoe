import React, { useState } from 'react';
import { View } from 'react-native';
import { useOptions } from '../api/options';
import type { Mode } from '../api/types';
import { opt, tx } from '../i18n/app';
import { modeColor, space } from '../theme/tokens';
import { Banner, Button, Chip, Chips, RangeSlider, Section, SectionLabel, Segmented, Sheet, Toggle } from '../ui';
import { defaultFilters, Filters } from './explore';

const DISTANCES = [1000, 5000, 10000, 25000, 50000];

// Filter groups per mode (R-04.8). Position/hosting need the viewer to be verified (R-06.5).
const GROUPS: Record<Mode, { key: string; verifiedOnly?: boolean }[]> = {
  hookup: [{ key: 'position', verifiedOnly: true }, { key: 'hosting', verifiedOnly: true }, { key: 'tribes' }, { key: 'build' }, { key: 'looking_for' }],
  friends: [{ key: 'looking_for' }, { key: 'tribes' }, { key: 'orientation' }],
  sport: [{ key: 'sports' }, { key: 'sport_level' }, { key: 'schedule' }, { key: 'sport_intent' }],
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

  return (
    <Sheet visible={visible} onClose={onClose} title={tx.filters.title} closeLabel={tx.common.close}>
      <RangeSlider
        label={tx.filters.age}
        min={18}
        max={99}
        low={f.age_min ?? 18}
        high={f.age_max ?? 99}
        fill={fill}
        format={(v) => (v === 99 ? '99+' : String(v))}
        onChange={(lo, hi) => setF((cur) => ({ ...cur, age_min: lo === 18 ? undefined : lo, age_max: hi === 99 ? undefined : hi }))}
      />
      <View style={{ gap: space.s }}>
        <SectionLabel>{tx.filters.distance} · km</SectionLabel>
        <Segmented
          grow
          label={tx.filters.distance}
          value={String(f.distance_max ?? 'any')}
          onChange={(v) => set('distance_max', v === 'any' ? undefined : Number(v))}
          fills={Object.fromEntries(['any', ...DISTANCES.map(String)].map((k) => [k, fill]))}
          options={[{ value: 'any', label: tx.filters.any }, ...DISTANCES.map((d) => ({ value: String(d), label: String(d / 1000) }))]}
        />
      </View>
      <Section>
      <Toggle label={tx.filters.verifiedOnly} value={f.verified_only} onChange={(v) => set('verified_only', v)} tone={fill} />
      <Toggle label={tx.filters.onlineNow} value={f.online_now} onChange={(v) => set('online_now', v)} tone={fill} />
      {mode === 'hookup' ? <Toggle label={tx.filters.hasNow} value={f.has_now} onChange={(v) => set('has_now', v)} tone={fill} /> : null}
      <Toggle label={tx.filters.hideCreators} value={f.hide_creators} onChange={(v) => set('hide_creators', v)} tone={fill} />
      <Toggle label={tx.filters.newMembers} value={f.new_members} onChange={(v) => set('new_members', v)} tone={fill} />
      </Section>
      {!verified && mode === 'hookup' ? <Banner tone="warn" text={tx.filters.verifiedHint} /> : null}
      {options
        ? GROUPS[mode].map(({ key, verifiedOnly }) =>
            verifiedOnly && !verified ? null : (
              <View key={key} style={{ gap: space.s }}>
                <SectionLabel>{tx.edit.fields[key] ?? key}</SectionLabel>
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
