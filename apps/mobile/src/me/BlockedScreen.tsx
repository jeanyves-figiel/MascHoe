import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { api } from '../api/client';
import { tx } from '../i18n/app';
import { color, space, type } from '../theme/tokens';
import { Button, EmptyState, Loading } from '../ui';

type Blocked = { profile_id: string; display_name: string; at: string };

// R-15.3 block list with unblock.
export function BlockedScreen() {
  const [list, setList] = useState<Blocked[] | null>(null);
  const load = useCallback(() => api<{ blocks: Blocked[] }>('GET', '/me/blocks').then((r) => setList(r.blocks)), []);
  useEffect(() => {
    load().catch(() => setList([]));
  }, [load]);
  if (!list) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase, paddingTop: space.s }}>
      <Text style={{ ...type.display, color: color.fgPrimary, paddingHorizontal: space.l }}>{tx.settings.blocked}</Text>
      {list.length === 0 ? (
        <EmptyState title={tx.me.noBlocks} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(b) => b.profile_id}
          contentContainerStyle={{ padding: space.l, gap: space.s }}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <Text style={{ ...type.body, color: color.fgPrimary, flex: 1 }}>{item.display_name}</Text>
              <Button small kind="secondary" title={tx.me.unblock} onPress={() => api('DELETE', `/me/blocks/${item.profile_id}`).then(load)} />
            </View>
          )}
        />
      )}
    </View>
  );
}
