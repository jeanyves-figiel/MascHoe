import React, { useEffect, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tx } from '../i18n/app';
import { v2 } from '../i18n/v2';
import { color, radius, space, tileFor, type } from '../theme/tokens';
import { Banner, Button, EmptyState, Field, Icon, ListRow, Loading, Scrim, Section, SectionLabel, Sheet } from '../ui';
import * as A from './albums';
import { getConv } from './engine';
import { useTopics } from './hooks';
import { PhotoViewer } from '../ui/PhotoViewer';
import { decryptToUri } from './media';

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void };

function useAlbums() {
  const [list, setList] = useState<A.Album[] | null>(null);
  useEffect(() => {
    const load = () => A.listAlbums().then(setList);
    load();
    return A.onAlbums(load);
  }, []);
  return list;
}

function Thumb({ item, size, onPress, h, r = radius.sm }: { item: { blob: string; key: string; iv: string; mime: string }; size: number; onPress?: () => void; h?: number; r?: number }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    decryptToUri(item).then(setUri, () => {});
  }, [item]);
  return (
    <Pressable accessibilityRole="imagebutton" onPress={onPress} onLongPress={onPress} style={{ width: size, height: h ?? size, borderRadius: r, overflow: 'hidden', backgroundColor: color.bgRaised }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: h ?? size }} resizeMode="cover" /> : null}
    </Pressable>
  );
}

type Item = { blob: string; key: string; iv: string; mime: string };

/** F-19 G13: album photos full screen; swipe between them, pinch to zoom, swipe down to close. */
function Viewer({ items, item, onClose, onRemove }: { items: Item[]; item: Item | null; onClose: () => void; onRemove?: (it: Item) => void }) {
  return (
    <PhotoViewer
      items={item ? items : null}
      index={item ? Math.max(0, items.indexOf(item)) : 0}
      src={(it: Item) => () => decryptToUri(it)}
      onClose={onClose}
      footer={
        onRemove
          ? (it: Item) => (
              <Pressable accessibilityRole="button" onPress={() => onRemove(it)} style={{ paddingHorizontal: space.xl, height: 44, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.danger }}>
                <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.albums.remove}</Text>
              </Pressable>
            )
          : undefined
      }
    />
  );
}

const cell = Math.floor((Math.min(Dimensions.get('window').width, 560) - space.l * 2 - space.s * 2) / 3);
const card = Math.floor((Math.min(Dimensions.get('window').width, 560) - space.l * 2 - space.m) / 2);

/** App v2 album card (issue 63): cover photo, Private pill, name and counts over a scrim. */
function AlbumCard({ a, onPress }: { a: A.Album; onPress: () => void }) {
  const cover = a.items[0];
  return (
    <Pressable testID={`album-${a.name}`} accessibilityRole="button" accessibilityLabel={a.name} onPress={onPress} style={({ pressed }) => ({ width: card, height: 200, borderRadius: radius.tray, overflow: 'hidden', backgroundColor: tileFor(a.id), opacity: pressed ? 0.85 : 1 })}>
      {cover ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Thumb item={cover} size={card} h={200} r={0} />
        </View>
      ) : null}
      <Scrim height="60%" />
      <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: color.scrim }}>
        <Icon.Lock size={12} />
        <Text style={{ ...type.caption, color: color.fgPrimary }}>{v2.albums.private}</Text>
      </View>
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 12, gap: 2 }}>
        <Text numberOfLines={1} style={{ ...type.headline, fontSize: 18, color: color.fgPrimary }}>
          {a.name}
        </Text>
        <Text numberOfLines={2} style={{ ...type.meta, color: color.fgSecondary }}>
          {tx.albums.count(a.items.length, a.shares.length)}
        </Text>
      </View>
    </Pressable>
  );
}

// S-42 Albums (R-08.9): my albums, items, "Shared with" list with revoke.
export function AlbumsScreen({ navigation }: { navigation: Nav }) {
  const list = useAlbums();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  if (!list) return <Loading />;
  return (
    <ScrollView keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l, paddingBottom: 120 }}>
      <View style={{ gap: space.xs }}>
        <Text accessibilityRole="header" style={{ ...type.display, color: color.fgPrimary }}>
          {tx.albums.title}
        </Text>
        <Text style={{ ...type.body, color: color.fgSecondary }}>{tx.albums.intro}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
        {list.map((a) => (
          <AlbumCard key={a.id} a={a} onPress={() => navigation.navigate('AlbumEdit', { id: a.id })} />
        ))}
        <Pressable testID="album-new" accessibilityRole="button" onPress={() => setAdding(true)} style={{ width: card, height: 200, borderRadius: radius.tray, borderWidth: 2, borderStyle: 'dashed', borderColor: color.line, alignItems: 'center', justifyContent: 'center', gap: space.s }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color.friends, alignItems: 'center', justifyContent: 'center' }}>
            <Icon.Plus c={color.onAccent} />
          </View>
          <Text style={{ ...type.headline, color: color.fgSecondary }}>{tx.albums.create}</Text>
        </Pressable>
      </View>
      <Sheet visible={adding} onClose={() => setAdding(false)} title={tx.albums.create} closeLabel={tx.common.close}>
        <Field label={tx.albums.newName} value={name} onChangeText={setName} maxLength={40} testID="album-name" autoFocus />
        <Button
          title={tx.albums.create}
          disabled={!name.trim()}
          onPress={() =>
            A.createAlbum(name).then(() => {
              setName('');
              setAdding(false);
            })
          }
          testID="album-create"
        />
      </Sheet>
    </ScrollView>
  );
}

export function AlbumEditScreen({ navigation, route }: { navigation: Nav; route: { params: { id: string } } }) {
  const list = useAlbums();
  useTopics('convs');
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<A.Album['items'][number] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const a = list?.find((x) => x.id === route.params.id);
  if (!list) return <Loading />;
  if (!a) return <EmptyState title={tx.albums.empty} />;
  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    setErr(null);
    try {
      await fn();
    } catch {
      setErr(tx.common.error);
    } finally {
      setBusy(null);
    }
  };
  return (
    <ScrollView keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l, paddingBottom: 120 }}>
      <Text accessibilityRole="header" style={{ ...type.display, color: color.fgPrimary }}>
        {a.name}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {a.items.map((it) => (
          <Thumb key={it.blob} item={it} size={cell} r={16} onPress={() => setView(it)} />
        ))}
        <Pressable testID="album-add" accessibilityRole="button" accessibilityLabel={tx.albums.add} disabled={busy === 'add'} onPress={() => run('add', () => A.addItems(a.id))} style={{ width: cell, height: cell, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}>
          {busy === 'add' ? <Loading /> : <Icon.Plus c={color.fgMuted} />}
        </Pressable>
      </View>
      {err ? <Banner tone="danger" text={err} /> : null}
      <SectionLabel>{tx.albums.sharedWith}</SectionLabel>
      {a.shares.length === 0 ? <Banner tone="trust" text={tx.albums.notShared} /> : null}
      {a.shares.length ? (
        <Section>
      {a.shares.map((s) => {
        const c = getConv(s.cid);
        return (
          <ListRow
            key={s.cid}
            title={c?.name ?? '…'}
            sub={s.until ? tx.albums.until(new Date(s.until).toLocaleString()) : undefined}
            right={busy === s.cid ? '…' : tx.albums.revoke}
            danger
            onPress={() => run(s.cid, () => A.revoke(a.id, s.cid))}
          />
        );
      })}
        </Section>
      ) : null}
      <Section>
        <ListRow title={tx.albums.delete} danger onPress={() => run('del', () => A.deleteAlbum(a.id)).then(() => navigation.goBack())} />
      </Section>
      <Viewer
        items={a.items}
        item={view}
        onClose={() => setView(null)}
        onRemove={(it) => {
          setView(null);
          run('rm', () => A.removeItem(a.id, it.blob));
        }}
      />
    </ScrollView>
  );
}

// Received album (album.grant): view-only grid until revoked or expired.
export function AlbumViewScreen({ route }: { route: { params: { cid: string; album: string } } }) {
  const tick = useTopics('msgs:' + route.params.cid);
  const [g, setG] = useState<Awaited<ReturnType<typeof A.receivedGrant>> | undefined>(undefined);
  const [view, setView] = useState<A.Album['items'][number] | null>(null);
  useEffect(() => {
    A.receivedGrant(route.params.cid, route.params.album).then(setG);
  }, [route.params.cid, route.params.album, tick]);
  if (g === undefined) return <Loading />;
  if (!g) return <EmptyState title={tx.chat.albumRevoked} />;
  return (
    <View style={{ flex: 1, backgroundColor: color.bgBase }}>
      <FlatList
        data={g.items}
        numColumns={3}
        keyExtractor={(i) => i.blob}
        ListHeaderComponent={<Text style={{ ...type.display, color: color.fgPrimary, marginBottom: space.m }}>{g.name}</Text>}
        contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.s }}
        columnWrapperStyle={{ gap: space.s }}
        renderItem={({ item }) => <Thumb item={item} size={cell} r={16} onPress={() => setView(item)} />}
      />
      <Viewer items={g.items} item={view} onClose={() => setView(null)} />
    </View>
  );
}
