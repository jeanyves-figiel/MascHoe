import React from 'react';
import { Text, View } from 'react-native';
import type { Mode, MyProfile } from '../api/types';
import { opt, tx } from '../i18n/app';
import { lensFields, lensPhoto } from '../profile/lens';
import { color, font, modeColor, radius, space, type } from '../theme/tokens';
import { Chips, Icon, Photo, Tag } from '../ui';

// Fields worth a chip in the compact preview, in reading order.
const CHIP_KEYS = ['looking_for', 'position', 'hosting', 'sports', 'sport_level', 'schedule', 'languages', 'tribes', 'relationship', 'build'];
const VERIFIED_ONLY = new Set(['position', 'hosting', 'practices', 'limits', 'groups', 'boundaries', 'gym']);

/**
 * S-60 lens preview (F-06 R-06.7, mockup in #96): how a verified viewer browsing `mode` sees
 * the profile. Friends and Sport drop spicy photos and hookup/health details (R-06.1b).
 */
export function LensPreview({ profile: p, mode, shown }: { profile: MyProfile; mode: Mode; shown: boolean }) {
  const tone = modeColor[mode];
  const box = { borderRadius: 22, borderWidth: 2, borderColor: tone, backgroundColor: color.bgRaised, padding: space.m, gap: space.m } as const;

  if (!shown)
    return (
      <View testID="lens-preview-off" style={[box, { borderStyle: 'dashed', alignItems: 'center', paddingVertical: space.xl }]}>
        <Icon.EyeOff size={22} c={color.fgMuted} />
        <Text style={{ ...type.body, color: color.fgSecondary, textAlign: 'center' }}>{tx.me.lensOff(tx.modes[mode])}</Text>
      </View>
    );

  const live = p.photos.filter((x) => x.url && x.status !== 'rejected').sort((a, b) => a.slot - b.slot);
  const visible = live.filter((x) => lensPhoto(x, mode));
  const hidden = live.length - visible.length;
  const fields = lensFields(
    Object.fromEntries(Object.entries(p.fields).filter(([k]) => !['chats', 'only_me'].includes(p.visibility_map[k] ?? ''))),
    mode,
  );
  const chips: { k: string; label: string }[] = [];
  for (const k of CHIP_KEYS) {
    const v = fields[k];
    const vals = Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];
    for (const x of vals) if (chips.length < 6) chips.push({ k, label: opt(String(x), k) });
  }

  return (
    <View testID={`lens-preview-${mode}`} style={box}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...type.headline, color: color.fgPrimary }}>
          {p.display_name}, {p.age}
        </Text>
        <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: tone, justifyContent: 'center' }}>
          <Text style={{ ...type.caption, color: color.onAccent }}>{tx.modes[mode]}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const ph = visible[i];
          return ph ? (
            <Photo key={ph.id} uri={ph.url} id={ph.id} label="" style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 10 }} />
          ) : (
            <View key={`e${i}`} style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 10, backgroundColor: color.bgOverlay, opacity: 0.5 }} />
          );
        })}
      </View>
      {hidden > 0 ? <Text style={{ ...type.meta, fontFamily: font.bold, color: tone }}>{tx.me.lensHidden(hidden)}</Text> : null}
      {chips.length ? (
        <Chips>
          {chips.map((c) => (
            <Tag key={c.k + c.label} label={c.label} tone={VERIFIED_ONLY.has(c.k) ? color.trust : tone} />
          ))}
        </Chips>
      ) : null}
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{mode === 'hookup' ? tx.me.lensHookupNote : tx.me.lensSafeNote}</Text>
    </View>
  );
}
