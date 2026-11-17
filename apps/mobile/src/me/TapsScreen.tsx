import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { api } from '../api/client';
import type { Tap } from '../api/types';
import { tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { EmptyState, Loading, Photo, VerifiedTick } from '../ui';

type Nav = { navigate: (s: string, p?: object) => void };

// F-08 taps received (7 days, R-08.2). Opening marks them seen.
export function TapsScreen({ navigation }: { navigation: Nav }) {
  const [list, setList] = useState<Tap[] | null>(null);
  useEffect(() => {
    api<{ taps: Tap[] }>('GET', '/taps')
      .then((r) => {
        setList(r.taps);
        api('POST', '/taps/seen').catch(() => {});
      })
      .catch(() => setList([]));
  }, []);
  if (!list) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase, paddingTop: space.s }}>
      <Text style={{ ...type.display, color: color.fgPrimary, paddingHorizontal: space.l }}>{tx.me.taps}</Text>
      {list.length === 0 ? (
        <EmptyState title={tx.me.noTaps} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.profile.id + t.at}
          contentContainerStyle={{ padding: space.l, gap: space.s }}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Profile', { id: item.profile.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <Photo uri={item.profile.photo} id={item.profile.id} label="" style={{ width: 56, height: 56, borderRadius: radius.pill }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ ...type.headline, color: color.fgPrimary }}>
                    {item.profile.display_name}, {item.profile.age}
                  </Text>
                  {item.profile.verified ? <VerifiedTick size={13} /> : null}
                </View>
                <Text style={{ ...type.meta, color: item.mutual ? color.personal : color.fgSecondary }}>
                  {item.mutual ? tx.profile.mutual : new Date(item.at).toLocaleString()}
                </Text>
              </View>
              {!item.seen ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.hookup }} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
