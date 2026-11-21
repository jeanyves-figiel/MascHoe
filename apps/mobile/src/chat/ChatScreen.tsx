import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { useSession } from '../app/session';
import { tx } from '../i18n/app';
import { SafetySheet, SheetRow } from '../trust/SafetySheet';
import { color, font, radius, space, type } from '../theme/tokens';
import { Banner, Button, Icon, ListRow, Loading, Photo, Segmented, Sheet, Toggle, useAccent, useNavSpace, VerifiedTick } from '../ui';
import * as E from './engine';
import { useTopics } from './hooks';
import { MediaBubble, pickAndSendMedia, SendOpts } from './media';
import * as Albums from './albums';
import { trx } from '../i18n/translate';
import { prefs } from '../me/prefs';
import { TranslatedText } from './TranslatedText';
import { ChatShield, MeetupCard, useCheckin } from '../safety/live';
import { chatLines, cueDismissed, meetupCue } from '../safety/quick';
import { langName, modeFor, targetLang, translateAvailable } from './translate';
import { ppl } from '../i18n/people';
import * as P from './people';
import { NoteSheet, NoteStrip } from '../profile/PrivateNote';
import { findHits, Marked } from './find';

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void; setOptions: (o: object) => void };
type Params = { cid?: string; profileId?: string; name?: string };

const REACTIONS = ['🔥', '❤️', '😂', '👍', '😮'];
const HIDDEN = new Set<E.Payload['t']>(['reaction', 'read', 'delivered', 'resync', 'profile.private']);

function statusText(m: E.Msg, group: boolean): string {
  switch (m.status) {
    case 'failed':
      return tx.chat.failed;
    case 'sending':
      return tx.chat.sending;
    case 'read':
      return group && m.readBy?.length ? tx.chat.readBy(m.readBy.length) : tx.chat.read;
    case 'delivered':
      return tx.chat.delivered;
    default:
      return tx.chat.sent;
  }
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'not_verified') return tx.chat.unverified;
    if (e.code === 'unavailable') return tx.chat.unavailable;
    if (e.code === 'rate_limited') return tx.chat.rateLimited;
  }
  return tx.common.error;
}

// S-41 Chat (F-07): header, E2EE line, messages, quick replies, composer.
// F-14 entrapment warning: unverified, or a meet request in his first 5 messages (local check).
const MEET = /\b(meet|come over|my place|your place|address|where are you|now\?|tonight|treffen|vorbei|rencontr|chez (moi|toi))\b/i;
function careful(c: E.Conv, list: E.Msg[]) {
  if (!c.verified) return true;
  return list
    .filter((m) => m.from === 'them')
    .slice(0, 5)
    .some((m) => MEET.test((m.p as { text?: string }).text ?? ''));
}

export function ChatScreen({ navigation, route }: { navigation: Nav; route: { params: Params } }) {
  const { me } = useSession();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  // #134/#137: bottom bars sit on the nav bar, or right on the keyboard while typing.
  const { kb, bottom: navBottom } = useNavSpace();
  const [cid, setCid] = useState<string | null>(route.params.cid ?? null);
  const [list, setList] = useState<E.Msg[] | null>(null);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [msgMenu, setMsgMenu] = useState<E.Msg | null>(null);
  const [custom, setCustom] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  // R-07.39 search in this chat (null = off).
  const [find, setFind] = useState<string | null>(null);
  const [hitAt, setHitAt] = useState(0);
  const listRef = useRef<FlatList<{ m: E.Msg; r: string[] }>>(null);
  P.usePeople();
  const [mediaSheet, setMediaSheet] = useState(false);
  const [albums, setAlbums] = useState<Albums.Album[]>([]);
  useEffect(() => {
    if (mediaSheet) Albums.listAlbums().then(setAlbums);
  }, [mediaSheet]);
  const [mopts, setMopts] = useState<SendOpts>({ once: false, expiry: 'keep', save: false });
  // R-07.28: language of the first translated message, for the teal note at the top of the chat.
  const [trFrom, setTrFrom] = useState<string | null>(null);
  const onTranslated = useCallback((from: string) => setTrFrom((cur) => cur ?? from), []);

  // Open by profile id (Profile › Message): from my one profile (R-06.1).
  useEffect(() => {
    if (cid || !route.params.profileId) return;
    const mine = me.profile;
    if (!mine) return;
    E.openConv(mine.id, route.params.profileId, { name: route.params.name }).then((c) => setCid(c.id));
  }, [cid, me, route.params.profileId, route.params.name]);

  const tick = useTopics('convs', cid ? 'msgs:' + cid : 'none', cid ? 'typing:' + cid : 'none2');
  // R-07.19: chip only after 3 s offline, so a quick reconnect doesn't flash it.
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (t) clearTimeout(t);
      t = null;
      if (E.isOnline()) setOffline(false);
      else t = setTimeout(() => setOffline(!E.isOnline()), Math.max(0, 3000 - (Date.now() - E.offlineSince())));
    };
    const off = E.on('net', check);
    t = setTimeout(check, 0);
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, []);
  const conv = cid ? E.getConv(cid) : undefined;
  const running = useCheckin();

  useEffect(() => {
    if (!cid) return;
    E.messages(cid).then(setList);
  }, [cid, tick]);

  // R-13.18: meetup prompt, matched on this phone only.
  const [cueOk, setCueOk] = useState<string | null>(null); // chat id whose cue is not dismissed
  const [hidden, setHidden] = useState(false);
  const cueHit = !!list && !!conv && !conv.ctx && !conv.gone && meetupCue(chatLines(list));
  useEffect(() => {
    if (!cid || !cueHit) return;
    let alive = true;
    cueDismissed(cid).then((d) => alive && setCueOk(d ? null : cid));
    return () => {
      alive = false;
    };
  }, [cid, cueHit]);
  const showCue = cueHit && cueOk === cid && !hidden && !running;

  useEffect(() => {
    if (cid) E.markRead(cid).catch(() => {});
  }, [cid, list?.length]);

  useEffect(() => {
    import('./quick').then((q) => q.customQuickReplies().then(setCustom));
  }, []);

  // Typing indicator expires after 6 s without a new event.
  const [, force] = useState(0);
  const typing = cid ? E.isTyping(cid) : false;
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => force((n) => n + 1), 6000);
    return () => clearTimeout(t);
  }, [typing, tick]);

  const visible = useMemo(() => {
    if (!list) return [];
    const reactions: Record<string, string[]> = {};
    for (const m of list) if (m.p.t === 'reaction') (reactions[m.p.to] ??= []).push(m.p.emoji);
    return list
      .filter((m) => !HIDDEN.has(m.p.t))
      .map((m) => ({ m, r: reactions[m.id] ?? [] }))
      .reverse();
  }, [list]);

  const lastMine = visible.find((x) => x.m.from === 'me')?.m.id;
  // R-07.36: only the latest request row is live (Accept / Pending); older ones are a plain line.
  const lastReq = visible.find((x) => x.m.p.t === 'friend' && x.m.p.op === 'request')?.m.id;
  const hits = useMemo(() => findHits(visible, find), [visible, find]);
  const hitSet = useMemo(() => new Set(hits), [hits]);
  const cur = hits[Math.min(hitAt, hits.length - 1)];
  useEffect(() => {
    if (cur !== undefined) listRef.current?.scrollToIndex({ index: cur, viewPosition: 0.5, animated: true });
  }, [cur]);

  const send = useCallback(
    async (p: E.Payload) => {
      if (!conv) return;
      const why = E.firstMessageProblem(conv, p);
      if (why) {
        setProblem(tx.chat.first[why]);
        return;
      }
      if (!conv.theyWrote && !me.verified) {
        setProblem(tx.chat.unverified);
        return;
      }
      setProblem(null);
      try {
        await E.send(conv.id, p);
      } catch (e) {
        setProblem(errorText(e));
      }
    },
    [conv, me.verified],
  );

  if (!cid || !conv || !list) return <Loading />;

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    send({ t: 'text', text: t });
  };

  const ttlLabel = tx.chat.ttl[conv.ttl];
  const trMode = modeFor(conv);
  const trCan = translateAvailable() && prefs().translate !== 'off';
  // Group chats (party / activity / club): no single peer, sender names from the E2EE payload.
  const group = !!conv.ctx;
  const fav = !group && P.isFav(conv.peer);
  const friend = group ? null : P.friendOf(conv.peer);
  const askFriend = () => {
    if (!me.verified) {
      setProblem(tx.chat.unverified);
      return;
    }
    E.requestFriend(conv.id).catch((e) => setProblem(errorText(e)));
  };
  const who = (m: E.Msg) => (m.from === 'me' ? tx.chat.you : group ? (m.by && conv.names?.[m.by]) || '…' : conv.name);

  const chatSettings = (
    <>
      <ListRow testID="menu-find" title={ppl.find} onPress={() => { setMenu(false); setHitAt(0); setFind(''); }} />
        <View style={{ gap: space.s }}>
          <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.chat.disappearing}</Text>
          <Segmented
            label={tx.chat.disappearing}
            value={conv.ttl}
            options={(['24h', '7d', 'never'] as E.Ttl[]).map((v) => ({ value: v, label: tx.chat.ttl[v] }))}
            onChange={(v) => {
              if (v !== conv.ttl) send({ t: 'disappearing', ttl: v });
            }}
          />
        </View>
        <View>
          {trCan ? (
            <Toggle
              label={trx.chat}
              sub={trFrom ? trx.chatSub(langName(trFrom), langName(targetLang())) : trx.chatSubAny}
              value={conv.translate !== 'off'}
              onChange={(v) => E.setConv(conv.id, { translate: v ? undefined : 'off' })}
            />
          ) : null}
          <Toggle
            label={tx.chat.chatReceipts}
            sub={me.settings?.read_receipts === false ? tx.chat.chatReceiptsGlobalOff : tx.chat.chatReceiptsSub}
            value={me.settings?.read_receipts !== false && conv.receipts !== 'off'}
            disabled={me.settings?.read_receipts === false}
            onChange={(v) => E.setConv(conv.id, { receipts: v ? undefined : 'off' })}
          />
          <ListRow title={conv.muted ? tx.chat.unmute : tx.chat.mute} onPress={() => E.setConv(conv.id, { muted: !conv.muted })} />
          {!group && conv.gone ? (
            <ListRow
              title={tx.chat.report}
              danger
              onPress={() => {
                setMenu(false);
                navigation.navigate('Report', { profileId: conv.peer, cid: conv.id });
              }}
            />
          ) : null}
          <ListRow
            title={tx.chat.deleteChat}
            danger
            onPress={() => E.deleteConv(conv.id).then(() => { setMenu(false); navigation.goBack(); })}
          />
        </View>
    </>
  );
  const q = hits.length ? find : null;
  const renderRow = ({ m, r }: { m: E.Msg; r: string[] }, ring: boolean) => {
          if (m.p.t === 'notice') {
            return (
              <View testID={`notice-${m.p.kind}`} style={{ alignSelf: 'center', maxWidth: '86%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.m, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: color.bgRaised, marginVertical: space.s }}>
                <Icon.Lock />
                <Text style={{ ...type.caption, color: color.fgSecondary, flexShrink: 1 }}>{m.p.kind === 'expired' ? tx.chat.expired(m.p.n ?? 1) : tx.chat.undecryptable}</Text>
              </View>
            );
          }
          if (m.p.t === 'friend') {
            // R-07.36 friend request / accepted.
            if (m.p.op === 'accept') {
              return (
                <View testID="friend-yes" style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: `${color.friends}24`, marginVertical: space.s }}>
                  <Icon.Check size={14} c={color.friends} />
                  <Text style={{ ...type.meta, fontFamily: font.heavy, color: color.friends }}>{ppl.nowFriends(conv.name)}</Text>
                </View>
              );
            }
            const live = m.id === lastReq && ((m.from === 'me' && friend === 'out') || (m.from === 'them' && friend === 'in'));
            if (!live) {
              return <Text style={{ ...type.meta, color: color.fgMuted, textAlign: 'center', marginVertical: space.s }}>{ppl.oldRequest}</Text>;
            }
            return (
              <View testID={m.from === 'me' ? 'friend-pending' : 'friend-ask'} style={{ alignSelf: 'stretch', marginVertical: space.s, padding: space.l, borderRadius: radius.md, backgroundColor: `${color.friends}1F`, alignItems: 'center', gap: space.s }}>
                <Icon.UserPlus size={26} />
                <Text style={{ ...type.headline, fontSize: 15, color: color.friends, textAlign: 'center' }}>{m.from === 'me' ? ppl.youAsked(conv.name) : ppl.askedYou(conv.name)}</Text>
                {m.from === 'me' ? (
                  <Text style={{ ...type.meta, color: color.fgSecondary, textAlign: 'center' }}>{ppl.pending}</Text>
                ) : (
                  <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.xs }}>
                    <Pressable testID="friend-no" accessibilityRole="button" onPress={() => E.answerFriend(conv.id, false)} style={{ height: 40, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: color.bgOverlay, justifyContent: 'center' }}>
                      <Text style={{ ...type.meta, fontFamily: font.heavy, color: color.fgPrimary }}>{ppl.notNow}</Text>
                    </Pressable>
                    <Pressable testID="friend-accept" accessibilityRole="button" onPress={() => E.answerFriend(conv.id, true)} style={{ height: 40, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: color.friends, justifyContent: 'center' }}>
                      <Text style={{ ...type.meta, fontFamily: font.heavy, color: color.onAccent }}>{ppl.accept}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }
          if (m.p.t === 'disappearing') {
            return (
              <Text style={{ ...type.meta, color: color.fgMuted, textAlign: 'center', marginVertical: space.s }}>
                {tx.chat.ttlChanged(who(m), tx.chat.ttl[m.p.ttl])}
              </Text>
            );
          }
          const mine = m.from === 'me';
          // R-07.25: incoming text and custom quick replies are translated on this phone.
          if (!mine && (m.p.t === 'text' || (m.p.t === 'quick_reply' && m.p.k === undefined))) {
            return (
              <TranslatedText
                cid={cid}
                id={m.id}
                text={m.p.text}
                mode={trMode}
                sender={group ? who(m) : null}
                senderColor={accent}
                reactions={r}
                onLongPress={() => setMsgMenu(m)}
                onTranslated={onTranslated}
                mark={q}
                ring={ring}
              />
            );
          }
          return (
            <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <Pressable
                testID={ring ? 'find-current' : `msg-${m.id}`}
                onLongPress={() => setMsgMenu(m)}
                onPress={() => {
                  if (m.status === 'failed') E.retry(cid, m.id).catch((e) => setProblem(errorText(e)));
                  else if (m.p.t === 'album.grant' && m.from === 'them') navigation.navigate('Album', { cid, album: m.p.album });
                }}
                style={{
                  maxWidth: '80%',
                  paddingHorizontal: space.m,
                  paddingVertical: 10,
                  borderRadius: 20,
                  borderBottomRightRadius: mine ? 6 : 20,
                  borderBottomLeftRadius: mine ? 20 : 6,
                  backgroundColor: mine ? accent : color.bgRaised,
                  borderWidth: ring ? 2 : 0,
                  borderColor: color.personal,
                  opacity: m.status === 'sending' ? 0.7 : 1,
                }}
              >
                {group && !mine ? <Text style={{ ...type.caption, color: accent }}>{who(m)}</Text> : null}
                <Bubble m={m} mine={mine} cid={cid} conv={conv} mark={q} />
              </Pressable>
              {r.length ? <Text style={{ ...type.meta, marginTop: -4 }}>{r.join('')}</Text> : null}
              {mine && (m.id === lastMine || m.status === 'failed') ? (
                <Text style={{ ...type.caption, color: m.status === 'failed' ? color.danger : color.fgMuted, marginTop: 2 }}>
                  {statusText(m, group)}
                </Text>
              ) : null}
            </View>
          );
  };
  // R-07.39: while searching, non-matches dim and the current match gets a sunflower ring.
  const findWrap = (index: number, el: React.ReactNode) => {
    if (find === null || !hits.length) return el;
    const hit = hitSet.has(index);
    return (
      <View style={{ opacity: hit ? 1 : 0.35 }}>
        {el}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bgBase }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {find !== null ? (
        <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.m, paddingBottom: space.s, flexDirection: 'row', alignItems: 'center', gap: space.s, borderBottomWidth: 1, borderColor: color.lineSubtle }}>
          <View style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: color.bgRaised, borderWidth: 2, borderColor: color.personal, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: 14 }}>
            <Icon.Search c={color.personal} />
            <TextInput
              testID="find-input"
              autoFocus
              value={find}
              onChangeText={(v) => {
                setFind(v);
                setHitAt(0);
              }}
              placeholder={ppl.findPh}
              placeholderTextColor={color.fgMuted}
              accessibilityLabel={ppl.findPh}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => setHitAt((i) => (hits.length ? (i + 1) % hits.length : 0))}
              style={{ flex: 1, color: color.fgPrimary, fontFamily: font.regular, fontSize: 15, paddingVertical: 0, outlineStyle: 'none' as never }}
            />
          </View>
          <Pressable testID="find-done" accessibilityRole="button" onPress={() => setFind(null)} hitSlop={8} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ ...type.headline, fontSize: 15, color: color.fgPrimary }}>{tx.common.done}</Text>
          </Pressable>
        </View>
      ) : (
      <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.l, paddingBottom: space.s, flexDirection: 'row', alignItems: 'center', gap: space.s, borderBottomWidth: 1, borderColor: color.lineSubtle }}>
        <Pressable accessibilityRole="button" accessibilityLabel={tx.common.back} onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon.Back />
        </Pressable>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, flex: 1 }} accessibilityRole="button" onPress={() => !conv.gone && !group && navigation.navigate('Profile', { id: conv.peer })}>
          <Photo uri={conv.photo} id={conv.peer || conv.id} label="" style={{ width: 42, height: 42, borderRadius: 21 }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={1} style={{ ...type.headline, color: color.fgPrimary, flexShrink: 1 }}>
                {conv.gone ? tx.chat.gone : conv.name}
              </Text>
              {conv.verified ? <VerifiedTick size={13} /> : null}
              {!group && P.friendOf(conv.peer) === 'yes' ? (
                <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: color.friends }}>
                  <Text style={{ ...type.caption, color: color.onAccent }}>{ppl.friend}</Text>
                </View>
              ) : null}
            </View>
            {offline ? (
              <View testID="chat-offline" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.fgMuted }} />
                <Text numberOfLines={1} style={{ ...type.meta, color: color.fgMuted, flexShrink: 1 }}>{tx.chat.waiting}</Text>
              </View>
            ) : typing ? (
              <Text style={{ ...type.meta, color: accent }}>{tx.chat.typing}</Text>
            ) : null}
          </View>
        </Pressable>
        {conv.ttl !== 'never' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tx.chat.disappearing} onPress={() => setMenu(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: color.personal }}>
            <Icon.Timer />
            {/* #115: compact (24h / 7d) so name, favorite and ⋯ fit the header. */}
            <Text style={{ ...type.caption, color: color.onAccent }}>{group ? ttlLabel : conv.ttl}</Text>
          </Pressable>
        ) : null}
        {!group && !conv.gone ? (
          <Pressable
            testID="chat-fav"
            accessibilityRole="button"
            accessibilityLabel={fav ? ppl.removeFav : ppl.addFav}
            accessibilityState={{ selected: fav }}
            onPress={() => P.setFav(conv.peer, !fav, { name: conv.name, photo: conv.photo })}
            hitSlop={2}
            style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: fav ? color.personal : color.bgRaised, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}
          >
            <Icon.Star size={21} c={fav ? color.onAccent : color.fgPrimary} fill={fav ? color.onAccent : 'none'} />
          </Pressable>
        ) : null}
        {!group && !conv.gone ? <ChatShield cid={conv.id} navigation={navigation} /> : null}
        <Pressable testID="chat-menu" accessibilityRole="button" accessibilityLabel="More" onPress={() => setMenu(true)} hitSlop={2} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.bgRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon.More />
        </Pressable>
      </View>
      )}
      {!group && find === null ? <NoteStrip peer={conv.peer} onPress={() => setNoteOpen(true)} /> : null}

      <FlatList
        ref={listRef}
        inverted
        // #134: dragging the messages closes the keyboard.
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={visible}
        keyExtractor={(x) => x.m.id}
        contentContainerStyle={{ padding: space.l, gap: space.xs }}
        ListFooterComponent={
          <View style={{ alignItems: 'center', gap: space.s, marginBottom: space.l }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.m, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: color.bgRaised }}>
              <Icon.Lock />
              <Text style={{ ...type.caption, color: color.trust }}>{group ? tx.group.e2ee : tx.chat.e2ee}</Text>
            </View>
            {trFrom ? (
              <View testID="tr-note" style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, maxWidth: 300, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: `${color.trust}1F` }}>
                <Icon.Translate size={18} w={2} />
                <Text style={{ ...type.caption, fontSize: 12, lineHeight: 16, fontFamily: font.medium, color: color.fgSoft, flexShrink: 1 }}>{trx.note(langName(trFrom), langName(targetLang()))}</Text>
              </View>
            ) : null}
          </View>
        }

        renderItem={({ item, index }) => findWrap(index, renderRow(item, find !== null && index === cur))}
        onScrollToIndexFailed={(e) => setTimeout(() => listRef.current?.scrollToIndex({ index: e.index, viewPosition: 0.5, animated: true }), 200)}
      />

      {showCue ? <MeetupCard cid={conv.id} name={conv.name} navigation={navigation} onHide={() => setHidden(true)} /> : null}
      {!showCue && !group && (me.safe_mode_active || me.safe_mode === 'on') && list && careful(conv, list) ? (
        <View style={{ paddingHorizontal: space.l }}>
          <Banner testID="careful" tone="warn" text={tx.safeMode.careful} onPress={() => navigation.navigate('CheckinStart', { cid: conv.id })} />
        </View>
      ) : null}
      {group && !conv.groups.length ? (
        <View style={{ paddingHorizontal: space.l }}>
          <Banner tone="trust" text={conv.host ? tx.group.sync : tx.group.pending} />
        </View>
      ) : null}
      {problem ? (
        <View style={{ paddingHorizontal: space.l }}>
          <Banner tone="warn" text={problem} onPress={() => (problem === tx.chat.unverified ? navigation.navigate('Verify') : setProblem(null))} />
        </View>
      ) : null}

      {find !== null ? (
        <View testID="find-bar" style={{ paddingHorizontal: space.m, paddingTop: 10, paddingBottom: navBottom + space.s, borderTopWidth: 1, borderColor: color.lineSubtle, backgroundColor: color.bgMap, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text testID="find-count" style={{ ...type.headline, color: color.fgPrimary }}>
              {(find ?? '').trim().length < 2 ? ppl.findHint : hits.length ? ppl.findCount(Math.min(hitAt, hits.length - 1) + 1, hits.length) : ppl.findNone}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon.Lock size={11} />
              <Text style={{ ...type.meta, fontSize: 12, color: color.fgMuted }}>{ppl.findLocal}</Text>
            </View>
          </View>
          {(
            [
              { label: ppl.findOlder, d: 'M6 15l6-6 6 6', on: () => setHitAt((i) => Math.min(hits.length - 1, i + 1)), off: hitAt >= hits.length - 1 },
              { label: ppl.findNewer, d: 'M6 9l6 6 6-6', on: () => setHitAt((i) => Math.max(0, i - 1)), off: hitAt <= 0 },
            ] as const
          ).map((b) => (
            <Pressable
              key={b.label}
              accessibilityRole="button"
              accessibilityLabel={b.label}
              accessibilityState={{ disabled: b.off || !hits.length }}
              onPress={b.off || !hits.length ? undefined : b.on}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.bgRaised, alignItems: 'center', justifyContent: 'center', opacity: b.off || !hits.length ? 0.4 : 1 }}
            >
              <Icon.Chevron d={b.d} />
            </Pressable>
          ))}
        </View>
      ) : !conv.gone ? (
        <>
          {!group ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l, paddingVertical: space.s }}>
              {[...tx.chat.quick, ...custom].map((q, i) => (
                <Pressable key={q + i} accessibilityRole="button" onPress={() => send(i < tx.chat.quick.length ? { t: 'quick_reply', text: q, k: i } : { t: 'quick_reply', text: q })} style={{ paddingHorizontal: 14, height: 36, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.bgRaised }}>
                  <Text style={{ ...type.meta, color: color.fgPrimary, fontFamily: font.medium }}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {/* #134: no home-indicator inset while the keyboard is up (it would leave a gap above the keys). */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s, paddingHorizontal: space.l, paddingBottom: navBottom + space.s }}>
            {conv.theyWrote ? (
              <Pressable
                testID="chat-attach"
                accessibilityRole="button"
                accessibilityLabel={tx.chat.photo}
                disabled={busy}
                onPress={() => setMediaSheet(true)}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.bgRaised, alignItems: 'center', justifyContent: 'center' }}
              >
                {busy ? <Text style={{ ...type.headline, color: color.fgPrimary }}>…</Text> : <Icon.Plus />}
              </Pressable>
            ) : null}
            <TextInput
              testID="chat-input"
              value={text}
              onChangeText={(v) => {
                setText(v);
                E.sendTyping(cid);
              }}
              placeholder={tx.chat.placeholder}
              placeholderTextColor={color.fgMuted}
              multiline
              maxLength={4000}
              onSubmitEditing={submit}
              blurOnSubmit={false}
              onKeyPress={(e) => {
                const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
                  (e as unknown as { preventDefault: () => void }).preventDefault();
                  submit();
                }
              }}
              style={{ flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, outlineStyle: 'none' as never, backgroundColor: color.bgRaised, color: color.fgPrimary, paddingHorizontal: space.m, paddingTop: 12, paddingBottom: 12, fontFamily: font.regular, fontSize: 15 }}
            />
            <Pressable
              testID="chat-send"
              accessibilityRole="button"
              accessibilityLabel={tx.chat.send}
              onPress={submit}
              disabled={!text.trim()}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? accent : color.bgRaised, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon.Send c={text.trim() ? color.onAccent : color.fgMuted} />
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={{ ...type.meta, color: color.fgMuted, textAlign: 'center', padding: space.l, paddingBottom: navBottom + space.l }}>{tx.chat.gone}</Text>
      )}

      {group || conv.gone ? (
        <Sheet visible={menu} onClose={() => setMenu(false)} title={conv.name} closeLabel={tx.common.close}>
          {chatSettings}
        </Sheet>
      ) : (
        // #111 S-51: 1:1 chat ⋯ = shared Hide / Block / Report sheet, chat settings below.
        <SafetySheet
          visible={menu}
          target={{ id: conv.peer, name: conv.name, age: conv.age }}
          onClose={() => setMenu(false)}
          onReport={(t) => navigation.navigate('Report', { profileId: t.id, cid: conv.id })}
          onGone={(kind) => {
            if (kind === 'block') E.setConv(conv.id, { archived: true }).finally(() => navigation.goBack());
          }}
          lead={
            <>
              <SheetRow title={tx.chat.viewProfile} onPress={() => { setMenu(false); navigation.navigate('Profile', { id: conv.peer }); }} />
              <SheetRow testID="menu-fav" title={fav ? ppl.removeFav : ppl.addFav} onPress={() => P.setFav(conv.peer, !fav, { name: conv.name, photo: conv.photo }).then(() => setMenu(false))} />
              {friend === 'in' ? (
                <SheetRow testID="menu-friend" title={ppl.acceptFriend} onPress={() => E.answerFriend(conv.id, true).then(() => setMenu(false))} />
              ) : friend ? (
                <SheetRow testID="menu-friend" title={friend === 'out' ? ppl.cancelRequest : ppl.removeFriend} onPress={() => E.dropFriend(conv.id).then(() => setMenu(false))} />
              ) : P.canAsk(conv.peer) && (conv.iWrote || conv.theyWrote) ? (
                <SheetRow testID="menu-friend" title={ppl.addFriend} onPress={() => { setMenu(false); askFriend(); }} />
              ) : null}
              <SheetRow testID="menu-note" title={P.noteFor(conv.peer) ? ppl.editNote : ppl.addNote} onPress={() => { setMenu(false); setNoteOpen(true); }} />
              <SheetRow last testID="chat-checkin" title={tx.safety.checkin} onPress={() => { setMenu(false); navigation.navigate('CheckinStart', { cid: conv.id }); }} />
            </>
          }
          after={chatSettings}
        />
      )}

      {!group ? <NoteSheet peer={conv.peer} visible={noteOpen} onClose={() => setNoteOpen(false)} /> : null}

      <Sheet visible={mediaSheet} onClose={() => setMediaSheet(false)} title={tx.chat.sendPhoto} closeLabel={tx.common.close}>
        <Toggle label={tx.chat.viewOnce} value={mopts.once} onChange={(v) => setMopts({ ...mopts, once: v })} />
        <View style={{ gap: space.s }}>
          <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.chat.expiry}</Text>
          <Segmented
            label={tx.chat.expiry}
            value={mopts.expiry}
            options={(['1h', '24h', '7d', 'keep'] as const).map((v) => ({ value: v, label: tx.chat.expiries[v] }))}
            onChange={(v) => setMopts({ ...mopts, expiry: v })}
          />
        </View>
        <Toggle label={tx.chat.allowSave} value={mopts.save} onChange={(v) => setMopts({ ...mopts, save: v })} />
        {albums.length ? (
          <View>
            <Text style={{ ...type.meta, color: color.fgSecondary, marginBottom: space.xs }}>{tx.albums.share}</Text>
            {albums.map((a) => (
              <ListRow
                key={a.id}
                testID={`share-album-${a.name}`}
                title={a.name}
                right={`${a.items.length}`}
                onPress={async () => {
                  setMediaSheet(false);
                  const exp = { '1h': 3600, '24h': 86400, '7d': 604800, keep: null }[mopts.expiry];
                  await Albums.grant(a.id, conv.id, exp).catch((e) => setProblem(errorText(e)));
                }}
              />
            ))}
          </View>
        ) : null}
        <Button
          title={tx.chat.choosePhoto}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await pickAndSendMedia(conv, mopts);
              setMediaSheet(false);
            } catch (e) {
              setMediaSheet(false);
              setProblem(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={!!msgMenu} onClose={() => setMsgMenu(null)} title="" closeLabel={tx.common.close}>
        {msgMenu ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {REACTIONS.map((e) => (
                <Pressable key={e} accessibilityRole="button" onPress={() => { send({ t: 'reaction', to: msgMenu.id, emoji: e }); setMsgMenu(null); }} style={{ padding: space.s }}>
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <View>
              {msgMenu.from === 'them' ? (
                <ListRow
                  title={tx.chat.report}
                  danger
                  onPress={() => {
                    const { id, by } = msgMenu;
                    setMsgMenu(null);
                    navigation.navigate('Report', { profileId: by ?? conv.peer, cid: conv.id, messageIds: [id] });
                  }}
                />
              ) : null}
              <ListRow title={tx.chat.deleteForMe} danger onPress={() => E.deleteMessage(cid, msgMenu.id).then(() => setMsgMenu(null))} />
            </View>
          </>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, mine, cid, conv, mark }: { m: E.Msg; mine: boolean; cid: string; conv: E.Conv; mark?: string | null }) {
  const fg = mine ? color.onAccent : color.fgPrimary;
  switch (m.p.t) {
    case 'text':
      return <Marked style={{ ...type.body, color: fg }} text={m.p.text} q={mark} onAccent={mine} />;
    case 'quick_reply':
      // R-07.31: built-in quick replies show in the reader's own language.
      return <Marked style={{ ...type.body, color: fg }} text={(m.p.k !== undefined && tx.chat.quick[m.p.k]) || m.p.text} q={mark} onAccent={mine} />;
    case 'media':
      return <MediaBubble m={m} media={m.p.media} mine={mine} cid={cid} conv={conv} />;
    case 'album.grant':
      return <Text style={{ ...type.body, color: fg }}>🔓 {tx.chat.album}: {m.p.name}</Text>;
    case 'album.revoke':
      return <Text style={{ ...type.body, color: fg }}>🔒 {tx.chat.albumRevoked}</Text>;
    case 'location.share':
      return <Text style={{ ...type.body, color: fg }}>📍 {tx.chat.location}</Text>;
    case 'screenshot':
      return <Text style={{ ...type.meta, color: fg }}>📸 {mine ? tx.chat.you : conv.name} {tx.chat.screenshot}</Text>;
    default:
      return <Text style={{ ...type.body, color: fg }}>{E.preview(m.p)}</Text>;
  }
}
