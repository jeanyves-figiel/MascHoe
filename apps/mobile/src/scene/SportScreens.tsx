import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api, ApiError } from '../api/client';
import { useOptions } from '../api/options';
import { useSession } from '../app/session';
import * as E from '../chat/engine';
import { distanceLabel, opt, tx } from '../i18n/app';
import { color, space, type } from '../theme/tokens';
import { Badge, Banner, Button, Chip, Chips, ErrorText, Field, ListRow, Loading, useAccent } from '../ui';
import { resyncHostGroups } from './groupSync';
import { Who } from './TonightScreen';
import type { Club, ClubDetail, Post } from './types';
import { day } from './types';

type Nav = {
  navigate: (s: string, p?: object) => void;
  goBack: () => void;
  replace: (s: string, p?: object) => void;
};

const errText = (e: unknown) => (e instanceof ApiError ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message) : tx.common.error);

function useSportProfile() {
  const { me } = useSession();
  return (me.profiles ?? []).find((p) => p.kind === 'sport') ?? null;
}

/** Opens a group chat for an activity/club; the host (or club owner) keeps the MLS group in sync. */
async function openGroupChat(ctx: string, title: string, mine: string, host: boolean, members: { id: string; name: string }[]) {
  const c = await E.openGroup(ctx, mine, title, host);
  if (host) await E.syncGroup(c.id, members);
  return c;
}

// Activity detail (F-11 R-11.4): join/leave, group chat, host removes.
export function ActivityScreen({ navigation, route }: { navigation: Nav; route: { params: { post: Post } } }) {
  const accent = useAccent();
  const mine = useSportProfile();
  const [p, setP] = useState(route.params.post);
  const [members, setMembers] = useState<{
    host: string;
    members: {
      id: string;
      display_name: string;
      age: number;
      verified: boolean;
      photo: string | null;
    }[];
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const host = p.my_state === 'host';
  const inside = host || p.my_state === 'joined';

  const loadMembers = useCallback(() => {
    if (inside) api<NonNullable<typeof members>>('GET', `/activities/${p.id}/members`).then(setMembers, () => {});
  }, [inside, p.id]);
  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const rsvp = async (join: boolean) => {
    setErr(null);
    try {
      await api('POST', `/activities/${p.id}/rsvp`, { join });
      setP({
        ...p,
        my_state: join ? 'joined' : null,
        joined: p.joined + (join ? 1 : -1),
      });
    } catch (e) {
      setErr(errText(e));
    }
  };

  const chat = async () => {
    if (!mine) return;
    const list = members?.members.map((m) => ({ id: m.id, name: m.display_name })) ?? [];
    const c = await openGroupChat('activity:' + p.id, p.title, mine.id, host, list);
    navigation.navigate('Chat', { cid: c.id });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgBase }}
      contentContainerStyle={{
        padding: space.l,
        gap: space.l,
        paddingBottom: 120,
      }}
    >
      <View style={{ flexDirection: 'row', gap: space.s, flexWrap: 'wrap' }}>
        <Badge label={opt(p.sport)} fill={accent} />
        <Badge label={tx.sport.intent[p.intent]} fill={color.bgInverse} />
        {p.club ? <Badge label={p.club.name} fill={color.friends} /> : null}
      </View>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{p.title}</Text>
      <Text style={{ ...type.body, color: color.fgSecondary }}>
        {day(p.starts_at)}
        {p.place ? ` · ${p.place}` : ''} · {distanceLabel(p.distance)}
      </Text>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.sport.going(p.joined, p.capacity)}</Text>
      <Who p={p.host} onPress={() => navigation.navigate('Profile', { id: p.host.id })} />
      <ErrorText text={err} />
      {host ? null : p.my_state === 'joined' ? <Button kind="secondary" title={tx.sport.leave} onPress={() => rsvp(false)} /> : <Button testID="activity-join" title={tx.sport.join} disabled={!mine} onPress={() => rsvp(true)} />}
      {!mine ? <Banner tone="warn" text={tx.sport.needProfile} onPress={() => navigation.navigate('Tabs', { screen: 'Me' })} /> : null}
      {inside ? <Button testID="activity-chat" kind="secondary" title={tx.sport.chat} onPress={chat} /> : null}
      {members
        ? members.members.map((m) => (
            <Who
              key={m.id}
              p={m}
              onPress={() => navigation.navigate('Profile', { id: m.id })}
              right={
                host && m.id !== members.host ? (
                  <Text onPress={() => api('DELETE', `/activities/${p.id}/members/${m.id}`).then(loadMembers)} style={{ ...type.meta, color: color.danger }}>
                    {tx.party.removeGuest}
                  </Text>
                ) : undefined
              }
            />
          ))
        : null}
      {host ? <ListRow title={tx.common.delete} danger onPress={() => api('DELETE', `/activities/${p.id}`).then(() => navigation.goBack())} /> : null}
    </ScrollView>
  );
}

// Post an activity (R-11.3).
export function ActivityNewScreen({ navigation }: { navigation: Nav }) {
  const accent = useAccent();
  const options = useOptions();
  const mine = useSportProfile();
  const [sport, setSport] = useState('running');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [inH, setInH] = useState(2);
  const [cap, setCap] = useState<number | null>(null);
  const [intent, setIntent] = useState<'just_sport' | 'open_to_more'>('just_sport');
  const [club, setClub] = useState<string | null>(null);
  const [adminClubs, setAdminClubs] = useState<Club[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ clubs: Club[] }>('GET', '/clubs').then(
      (r) => setAdminClubs(r.clubs.filter((c) => c.my_role === 'admin')),
      () => {},
    );
  }, []);

  const when = (h: number) => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() + h * 3600e3);
  };

  const post = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('POST', '/activities', {
        sport,
        title: title.trim(),
        place_text: place.trim(),
        starts_at: when(inH).toISOString(),
        capacity: cap,
        intent,
        club_id: club,
      });
      navigation.goBack();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgBase }}
      contentContainerStyle={{
        padding: space.l,
        gap: space.l,
        paddingBottom: 120,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.sport.post}</Text>
      {!mine ? <Banner tone="warn" text={tx.sport.needProfile} /> : null}
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.sport.sportPick}</Text>
      <Chips>
        {(options?.options.sports ?? []).map((s) => (
          <Chip key={s} label={opt(s)} on={sport === s} fill={accent} onPress={() => setSport(s)} />
        ))}
      </Chips>
      <Field testID="activity-title" label={tx.sport.activityTitle} value={title} onChangeText={setTitle} maxLength={80} />
      <Field label={tx.sport.place} value={place} onChangeText={setPlace} maxLength={80} />
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.sport.when}</Text>
      <Chips>
        {[1, 2, 3, 4, 6, 12, 24, 48].map((h) => (
          <Chip key={h} label={day(when(h).toISOString())} on={inH === h} fill={accent} onPress={() => setInH(h)} />
        ))}
      </Chips>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.sport.cap}</Text>
      <Chips>
        {[null, 2, 4, 6, 10, 20].map((n) => (
          <Chip key={String(n)} label={n ? String(n) : '∞'} on={cap === n} fill={accent} onPress={() => setCap(n)} />
        ))}
      </Chips>
      <Chips>
        {(['just_sport', 'open_to_more'] as const).map((i) => (
          <Chip key={i} label={tx.sport.intent[i]} on={intent === i} fill={color.trust} onPress={() => setIntent(i)} />
        ))}
      </Chips>
      {adminClubs.length ? (
        <>
          <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.sport.asClub}</Text>
          <Chips>
            <Chip label="—" on={club === null} onPress={() => setClub(null)} />
            {adminClubs.map((c) => (
              <Chip key={c.id} label={c.name} on={club === c.id} fill={color.friends} onPress={() => setClub(c.id)} />
            ))}
          </Chips>
        </>
      ) : null}
      <ErrorText text={err} />
      <Button testID="activity-post" title={tx.tonight.publish} busy={busy} disabled={!title.trim() || !mine} onPress={post} />
    </ScrollView>
  );
}

// Club page (R-11.6): join/request, events, members (admins approve), club chat.
export function ClubScreen({ navigation, route }: { navigation: Nav; route: { params: { id: string } } }) {
  const accent = useAccent();
  const mine = useSportProfile();
  const [c, setC] = useState<ClubDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<ClubDetail>('GET', `/clubs/${route.params.id}`).then(setC, (e) => setErr(errText(e))), [route.params.id]);
  useEffect(() => {
    load();
  }, [load]);
  if (!c) return err ? <Banner tone="danger" text={err} /> : <Loading />;
  const admin = c.my_role === 'admin';
  const act = (fn: () => Promise<unknown>) =>
    fn()
      .then((r) => (r && typeof r === 'object' && 'id' in (r as object) ? setC(r as ClubDetail) : load()))
      .then(() => resyncHostGroups())
      .catch((e) => setErr(errText(e)));
  const owner = c.member_list?.find((m) => m.role === 'admin')?.profile.id;

  const chat = async () => {
    if (!mine) return;
    const list = (c.member_list ?? []).filter((m) => m.state === 'member').map((m) => ({ id: m.profile.id, name: m.profile.display_name }));
    const g = await openGroupChat('club:' + c.id, c.name, mine.id, owner === mine.id, list);
    navigation.navigate('Chat', { cid: g.id });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgBase }}
      contentContainerStyle={{
        padding: space.l,
        gap: space.l,
        paddingBottom: 120,
      }}
    >
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Badge label={opt(c.sport)} fill={accent} />
        {c.verified_club ? <Badge label="✓ Partner" fill={color.trust} /> : null}
      </View>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{c.name}</Text>
      {c.description ? <Text style={{ ...type.body, color: color.fgSecondary }}>{c.description}</Text> : null}
      <Text style={{ ...type.meta, color: color.fgMuted }}>
        {tx.sport.members(c.members)} · {tx.sport.policies[c.join_policy]}
      </Text>
      <ErrorText text={err} />
      {c.my_state === null ? (
        <Button testID="club-join" title={c.join_policy === 'open' ? tx.sport.joinClub : tx.sport.requestJoin} disabled={!mine} onPress={() => act(() => api('POST', `/clubs/${c.id}/join`))} />
      ) : c.my_state === 'requested' ? (
        <Banner tone="trust" text={tx.sport.pending} />
      ) : (
        <Button testID="club-chat" title={tx.sport.clubChat} onPress={chat} />
      )}
      <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.sport.events}</Text>
      {c.events.map((e) => (
        <ListRow key={e.id} title={e.title} sub={`${day(e.starts_at)}${e.place ? ` · ${e.place}` : ''}`} />
      ))}
      {admin ? <ListRow title={tx.sport.post} onPress={() => navigation.navigate('ActivityNew')} /> : null}
      {c.member_list?.map((m) => (
        <Who
          key={m.profile.id}
          p={m.profile}
          sub={m.role === 'admin' ? 'Admin' : m.state === 'requested' ? tx.sport.pending : undefined}
          onPress={() => navigation.navigate('Profile', { id: m.profile.id })}
          right={
            admin && m.state === 'requested' ? (
              <Text onPress={() => act(() => api('POST', `/clubs/${c.id}/members/${m.profile.id}/approve`))} style={{ ...type.meta, color: accent }}>
                {tx.sport.approve}
              </Text>
            ) : admin && m.role !== 'admin' ? (
              <Text onPress={() => act(() => api('POST', `/clubs/${c.id}/members/${m.profile.id}/remove`))} style={{ ...type.meta, color: color.danger }}>
                {tx.party.removeGuest}
              </Text>
            ) : undefined
          }
        />
      ))}
      {c.my_state ? <ListRow title={tx.sport.leave} danger onPress={() => api('POST', `/clubs/${c.id}/leave`).then(() => navigation.goBack())} /> : null}
    </ScrollView>
  );
}

export function ClubNewScreen({ navigation }: { navigation: Nav }) {
  const accent = useAccent();
  const options = useOptions();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [sport, setSport] = useState('running');
  const [policy, setPolicy] = useState<'open' | 'request'>('open');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const c = await api<Club>('POST', '/clubs', {
        name: name.trim(),
        description: desc.trim(),
        sport,
        join_policy: policy,
      });
      navigation.replace('Club', { id: c.id });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgBase }}
      contentContainerStyle={{
        padding: space.l,
        gap: space.l,
        paddingBottom: 120,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.sport.newClub}</Text>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.sport.clubAge}</Text>
      <Field label={tx.sport.clubName} value={name} onChangeText={setName} maxLength={60} />
      <Field label={tx.sport.description} value={desc} onChangeText={setDesc} maxLength={500} multiline />
      <Chips>
        {(options?.options.sports ?? []).map((s) => (
          <Chip key={s} label={opt(s)} on={sport === s} fill={accent} onPress={() => setSport(s)} />
        ))}
      </Chips>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.sport.policy}</Text>
      <Chips>
        {(['open', 'request'] as const).map((p) => (
          <Chip key={p} label={tx.sport.policies[p]} on={policy === p} fill={color.trust} onPress={() => setPolicy(p)} />
        ))}
      </Chips>
      <ErrorText text={err} />
      <Button title={tx.sport.newClub} busy={busy} disabled={!name.trim()} onPress={create} />
    </ScrollView>
  );
}
