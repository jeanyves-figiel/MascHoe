import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Card } from '../api/types';
import { distanceLabel, tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { Photo, useAccent, VerifiedTick } from '../ui';

// R-04.5 grid card / R-04.4 tray card: photo, name, tick, online dot, distance, Now/Exact badge.
export function ProfileTile({ card, onPress, onLongPress, tray }: { card: Card; onPress: () => void; onLongPress?: () => void; tray?: boolean }) {
  const accent = useAccent();
  const hot = !!card.now || card.exact;
  const label = `${card.display_name}, ${card.age}${card.verified ? ', verified' : ''}, ${distanceLabel(card.distance)}${card.now ? ', ' + tx.now[card.now.status] : ''}`;
  return (
    <Pressable
      testID={`tile-${card.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        tray
          ? { width: 150, height: 200, borderRadius: radius.tray, borderWidth: 3, borderColor: hot ? accent : color.lineSubtle }
          : { flex: 1, aspectRatio: 3 / 4, borderRadius: radius.md },
        { overflow: 'hidden', backgroundColor: color.bgRaised },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Photo uri={card.photo} id={card.id} label={`${card.display_name}'s photo`} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {card.online ? <View style={{ position: 'absolute', top: 9, right: 9, width: 12, height: 12, borderRadius: 6, backgroundColor: accent, borderWidth: 2, borderColor: color.bgBase }} /> : null}
      {card.now || card.exact ? (
        <View style={{ position: 'absolute', top: space.s, left: space.s, paddingHorizontal: space.s, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: card.exact ? color.trust : accent }}>
          <Text style={{ ...type.caption, color: color.onAccent }}>{card.now ? tx.now[card.now.status] : 'Exact'}</Text>
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.s + 2, paddingVertical: space.s, backgroundColor: tray ? color.bgBase : 'rgba(23,20,46,0.55)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ ...type.headline, fontSize: tray ? 16 : 14, color: color.fgPrimary, flexShrink: 1 }}>
            {card.display_name}
          </Text>
          {card.verified ? <VerifiedTick size={13} /> : null}
        </View>
        <Text numberOfLines={1} style={{ ...type.meta, fontSize: 11, color: color.fgSoft }}>
          {[distanceLabel(card.distance), card.now?.text].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}
