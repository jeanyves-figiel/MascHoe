import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSession } from '../app/session';
import { tx } from '../i18n/app';
import { LENSES } from '../profile/lens';
import { color, modeColor, radius, space, type } from '../theme/tokens';
import { Segmented } from '../ui';
import { LensPreview } from './LensPreview';

type Nav = { navigate: (s: string, p?: object) => void };

// S-66 Lens preview (#102): moved off Me. "See yourself in" segment, live preview, Preview as.
export function LensPreviewScreen({ navigation }: { navigation: Nav }) {
  const { me, mode, setMode } = useSession();
  const p = me.profile ?? me.profiles?.[0];
  if (!p) return null;
  const showIn = p.show_in ?? ['hookup'];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l, paddingBottom: 80, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Text accessibilityRole="header" style={{ ...type.display, color: color.fgPrimary }}>
        {tx.me.seeYourselfIn}
      </Text>
      <Segmented label={tx.me.seeYourselfIn} value={mode} onChange={setMode} fills={modeColor} options={LENSES.map((m) => ({ value: m, label: tx.modes[m] }))} />
      <LensPreview profile={p} mode={mode} shown={showIn.includes(mode)} />
      <View style={{ gap: space.s }}>
        <Text style={{ ...type.caption, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: color.fgMuted }}>{tx.me.previewAs}</Text>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          {(['stranger', 'verified', 'chats'] as const).map((as) => (
            <Pressable
              key={as}
              accessibilityRole="button"
              accessibilityLabel={`${tx.me.previewAs} ${tx.me.previews[as]}`}
              onPress={() => navigation.navigate('Profile', { id: p.id, preview: as, mode })}
              style={{ flex: 1, height: 44, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.bgRaised, alignItems: 'center' }}
            >
              <Text style={{ ...type.meta, color: color.fgPrimary }}>{tx.me.previews[as]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
