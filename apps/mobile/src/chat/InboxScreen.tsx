import React, { useEffect, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import type { Tap } from '../api/types';
import { tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { EmptyState, ListRow, Photo, Sheet, useAccent, VerifiedTick } from '../ui';
import { Conv, deleteConv, getConvs, setConv } from './engine';
import { useTopics } from './hooks';

type Nav = { navigate: (s: string, p?: object) => void };

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return new Date(t).toLocaleDateString();
};

// S-40 Inbox (R-07.8, R-07.15): Taps row, New (unreplied inbound), Chats, Parties & groups (B3).
export function InboxScreen({ navigation }: { navigation: Nav }) {
  useTopics('convs');
  const tapsTick = useTopics('taps');
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const [taps, setTaps] = useState<number | null>(null);
  const [menu, setMenu] = useState<Conv | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    api<{ taps: Tap[] }>('GET', '/taps')
      .then((r) => setTaps(r.taps.filter((t) => !t.seen).length))
      .catch(() => setTaps(0));
  }, [tapsTick]);

  const all = getConvs().filter((c) => c.last || c.groups.length);
  const live = all.filter((c) => !!c.archived === showArchived);
  const starred = (a: Conv, b: Conv) => Number(!!b.starred) - Number(!!a.starred);
  const groups = live.filter((c) => !!c.ctx).sort(starred);
  const fresh = live.filter((c) => !c.ctx && c.theyWrote && !c.iWrote).sort(starred);
  const chats = live.filter((c) => !c.ctx && !(c.theyWrote && !c.iWrote)).sort(starred);
  const sections = [
    ...(fresh.length ? [{ title: tx.chat.new, data: fresh }] : []),
    ...(groups.length ? [{ title: tx.chat.parties, data: groups }] : []),
    ...(chats.length ? [{ title: showArchived ? tx.chat.archived : tx.chat.chats, data: chats }] : []),
  ];
  const archivedCount = all.filter((c) => c.archived).length;

  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase, paddingTop: insets.top + space.s }}>
      <Text accessibilityRole="header" style={{ ...type.display, color: color.fgPrimary, paddingHorizontal: space.l, marginBottom: space.s }}>
        {tx.chat.title}
      </Text>
      <Pressable
        testID="inbox-taps"
        accessibilityRole="button"
        onPress={() => navigation.navigate('Taps')}
        style={{ marginHorizontal: space.l, marginBottom: space.s, padding: space.m, borderRadius: radius.md, backgroundColor: color.bgRaised, flexDirection: 'row', alignItems: 'center', gap: space.m }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.personal, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...type.headline, color: color.onAccent }}>✦</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.chat.taps}</Text>
          <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.chat.tapsNew(taps ?? 0)}</Text>
        </View>
        {taps ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} /> : null}
      </Pressable>
      {all.length === 0 ? (
        <EmptyState title={tx.chat.empty} body={tx.chat.emptyBody} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderSectionHeader={({ section }) => (
            <Text style={{ ...type.caption, color: color.fgMuted, textTransform: 'uppercase', paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.xs, backgroundColor: color.bgBase }}>
              {section.title}
            </Text>
          )}
          renderItem={({ item: c }) => (
            <Pressable
              testID={`conv-${c.peer}`}
              accessibilityRole="button"
              onPress={() => navigation.navigate('Chat', { cid: c.id })}
              onLongPress={() => setMenu(c)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.s, opacity: c.gone ? 0.5 : 1 }}
            >
              <Photo uri={c.photo} id={c.peer} label="" style={{ width: 56, height: 56, borderRadius: radius.pill }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text numberOfLines={1} style={{ ...type.headline, color: color.fgPrimary, flexShrink: 1 }}>
                    {c.starred ? '★ ' : ''}
                    {c.gone ? tx.chat.gone : c.name}
                  </Text>
                  {c.verified ? <VerifiedTick size={13} /> : null}
                  {c.muted ? <Text style={{ ...type.meta, color: color.fgMuted }}> 🔕</Text> : null}
                </View>
                <Text numberOfLines={1} style={{ ...type.meta, color: c.unread ? color.fgPrimary : color.fgSecondary }}>
                  {c.last}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ ...type.caption, color: color.fgMuted }}>{ago(c.lastAt)}</Text>
                {c.unread ? (
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: c.muted ? color.fgMuted : accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ ...type.caption, color: color.onAccent }}>{c.unread}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            archivedCount || showArchived ? (
              <Pressable accessibilityRole="button" onPress={() => setShowArchived(!showArchived)} style={{ padding: space.l }}>
                <Text style={{ ...type.meta, color: color.fgSecondary, textAlign: 'center' }}>
                  {showArchived ? tx.chat.chats : `${tx.chat.archived} · ${archivedCount}`}
                </Text>
              </Pressable>
            ) : undefined
          }
        />
      )}
      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.name ?? ''} closeLabel={tx.common.close}>
        {menu ? (
          <View>
            <ListRow title={menu.starred ? tx.chat.unstar : tx.chat.star} onPress={() => setConv(menu.id, { starred: !menu.starred }).then(() => setMenu(null))} />
            <ListRow title={menu.muted ? tx.chat.unmute : tx.chat.mute} onPress={() => setConv(menu.id, { muted: !menu.muted }).then(() => setMenu(null))} />
            <ListRow title={menu.archived ? tx.chat.unarchive : tx.chat.archive} onPress={() => setConv(menu.id, { archived: !menu.archived }).then(() => setMenu(null))} />
            <ListRow title={tx.chat.deleteChat} danger onPress={() => deleteConv(menu.id).then(() => setMenu(null))} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
