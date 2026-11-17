import React, { useEffect, useState } from 'react';
import { Dimensions, FlatList, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { Button, EmptyState, Field, ListRow, Loading } from '../ui';
import * as A from './albums';
import { getConv } from './engine';
import { useTopics } from './hooks';
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

function Thumb({ item, size, onPress }: { item: { blob: string; key: string; iv: string; mime: string }; size: number; onPress?: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    decryptToUri(item).then(setUri, () => {});
  }, [item]);
  return (
    <Pressable accessibilityRole="imagebutton" onPress={onPress} onLongPress={onPress} style={{ width: size, height: size, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: color.bgRaised }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" /> : null}
    </Pressable>
  );
}

function Viewer({ item, onClose, onRemove }: { item: { blob: string; key: string; iv: string; mime: string } | null; onClose: () => void; onRemove?: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (item) decryptToUri(item).then(setUri, () => {});
  }, [item]);
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel={tx.common.close} style={{ flex: 1, backgroundColor: color.bgBase, alignItems: 'center', justifyContent: 'center' }}>
        {uri && item ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
      </Pressable>
      {onRemove ? (
        <Pressable accessibilityRole="button" onPress={onRemove} style={{ position: 'absolute', bottom: space.huge, alignSelf: 'center', paddingHorizontal: space.xl, height: 44, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.danger }}>
          <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.albums.remove}</Text>
        </Pressable>
      ) : null}
    </Modal>
  );
}

const cell = Math.floor((Math.min(Dimensions.get('window').width, 560) - space.l * 2 - space.s * 2) / 3);

// S-42 Albums (R-08.9): my albums, items, "Shared with" list with revoke.
export function AlbumsScreen({ navigation }: { navigation: Nav }) {
  const list = useAlbums();
  const [name, setName] = useState('');
  if (!list) return <Loading />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: 120 }}>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.albums.title}</Text>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.albums.intro}</Text>
      {list.length === 0 ? <EmptyState title={tx.albums.empty} /> : null}
      {list.map((a) => (
        <ListRow key={a.id} testID={`album-${a.name}`} title={a.name} sub={tx.albums.count(a.items.length, a.shares.length)} onPress={() => navigation.navigate('AlbumEdit', { id: a.id })} />
      ))}
      <Field label={tx.albums.newName} value={name} onChangeText={setName} maxLength={40} testID="album-name" />
      <Button title={tx.albums.create} disabled={!name.trim()} onPress={() => A.createAlbum(name).then(() => setName(''))} testID="album-create" />
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
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: 120 }}>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{a.name}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {a.items.map((it) => (
          <Thumb key={it.blob} item={it} size={cell} onPress={() => setView(it)} />
        ))}
      </View>
      <Button title={tx.albums.add} busy={busy === 'add'} onPress={() => run('add', () => A.addItems(a.id))} testID="album-add" />
      {err ? <Text style={{ ...type.meta, color: color.danger }}>{err}</Text> : null}
      <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.albums.sharedWith}</Text>
      {a.shares.length === 0 ? <Text style={{ ...type.meta, color: color.fgMuted }}>{tx.albums.notShared}</Text> : null}
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
      <ListRow title={tx.albums.delete} danger onPress={() => run('del', () => A.deleteAlbum(a.id)).then(() => navigation.goBack())} />
      <Viewer
        item={view}
        onClose={() => setView(null)}
        onRemove={() => {
          const b = view!.blob;
          setView(null);
          run('rm', () => A.removeItem(a.id, b));
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
        contentContainerStyle={{ padding: space.l, gap: space.s }}
        columnWrapperStyle={{ gap: space.s }}
        renderItem={({ item }) => <Thumb item={item} size={cell} onPress={() => setView(item)} />}
      />
      <Viewer item={view} onClose={() => setView(null)} />
    </View>
  );
}
