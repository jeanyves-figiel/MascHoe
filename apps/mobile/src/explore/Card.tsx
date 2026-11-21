import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Card } from '../api/types';
import { distanceLabel, tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { Photo, Scrim, useAccent, VerifiedTick } from '../ui';
import { IntentBar } from './IntentRing';

// R-04.5 grid card / R-04.4 tray card: photo, name, tick, online dot, distance, Now/Exact badge.
export function ProfileTile({ card, onPress, onLongPress, tray, selected }: { card: Card; onPress: () => void; onLongPress?: () => void; tray?: boolean; selected?: boolean }) {
  const accent = useAccent();
  const hot = !!card.now || card.exact;
  const label = `${card.display_name}, ${card.age}${card.verified ? ', verified' : ''}, ${distanceLabel(card.distance)}${card.now ? ', ' + tx.now[card.now.status] : ''}`;
  return (
    <Pressable
      testID={`tile-${card.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        tray
          ? { width: 132, height: 172, borderRadius: radius.tray, borderWidth: 2, borderColor: hot ? accent : 'transparent' }
          : { flex: 1, aspectRatio: 3 / 4, borderRadius: 18, borderWidth: selected ? 3 : 0, borderColor: accent },
        { overflow: 'hidden', backgroundColor: color.bgRaised },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <Photo uri={card.photo} id={card.id} label={`${card.display_name}'s photo`} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <Scrim height="60%" max={tray ? 0.92 : 0.85} />
      {card.online ? (
        <View accessible accessibilityLabel="Online" style={{ position: 'absolute', top: 8, right: 8, width: 12, height: 12, borderRadius: 6, backgroundColor: color.sport, borderWidth: 2, borderColor: color.bgBase }} />
      ) : null}
      {card.now || card.exact ? (
        <View style={{ position: 'absolute', top: space.s, left: space.s, paddingHorizontal: space.s, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: card.exact ? color.trust : accent }}>
          <Text style={{ ...type.caption, fontSize: 10, color: color.onAccent }}>{card.now ? tx.now[card.now.status] : 'Exact'}</Text>
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: space.s + 2, right: space.s + 2, bottom: space.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ ...type.headline, fontSize: tray ? 15 : 14, color: color.fgPrimary, flexShrink: 1 }}>
            {card.display_name}
            {tray ? `, ${card.age}` : ` ${card.age}`}
          </Text>
          {card.verified ? <VerifiedTick size={13} /> : null}
        </View>
        <Text numberOfLines={1} style={{ ...type.meta, fontSize: 11, color: color.fgSecondary }}>
          {[distanceLabel(card.distance), card.now?.text].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {/* R-04.19: his intents along the bottom edge */}
      {tray ? null : <IntentBar intents={card.intents} />}
    </Pressable>
  );
}
