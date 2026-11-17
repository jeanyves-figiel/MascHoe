import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api/client';
import { useOptions } from '../api/options';
import { useSession } from '../app/session';
import { distanceLabel, opt, tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { Banner, Button, Chip, Chips, EmptyState, Icon, ListRow, Loading, Photo, useAccent, VerifiedTick } from '../ui';
import { PlanSheet } from './PlanSheet';
import type { Club, MyPlan, Party, Plan, Post, Venue } from './types';
import { day, time } from './types';

type Nav = { navigate: (s: string, p?: object) => void };
type Win = 'now2' | 'now4' | 'late';

function windowRange(w: Win): [Date, Date] {
  const from = new Date();
  if (w === 'now2') return [from, new Date(from.getTime() + 2 * 3600e3)];
  if (w === 'now4') return [from, new Date(from.getTime() + 4 * 3600e3)];
  const to = new Date(from);
  to.setHours(27, 0, 0, 0);
  return [from, to];
}

export function Who({ p, sub, onPress, right }: { p: Plan['profile']; sub?: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
      <Photo uri={p.photo} id={p.id} label="" style={{ width: 44, height: 44, borderRadius: 22 }} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ ...type.headline, color: color.fgPrimary }}>
            {p.display_name}, {p.age}
          </Text>
          {p.verified ? <VerifiedTick size={13} /> : null}
        </View>
        {sub ? <Text style={{ ...type.meta, color: color.fgSecondary }}>{sub}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function PartyCard({ p, onPress }: { p: Party; onPress: () => void }) {
  const accent = useAccent();
  return (
    <Pressable
      testID={`party-${p.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        padding: space.l,
        borderRadius: 22,
        backgroundColor: color.bgRaised,
        gap: space.s,
        borderWidth: 2,
        borderColor: accent,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: accent, justifyContent: 'center' }}>
          <Text style={{ ...type.caption, color: color.onAccent, textTransform: 'uppercase' }}>{tx.party.status[p.status]}</Text>
        </View>
        <Text style={{ ...type.caption, color: color.fgSecondary }}>{tx.party.seats(p.seats_taken, p.capacity)}</Text>
      </View>
      <Text style={{ ...type.title, fontSize: 24, lineHeight: 28, color: color.fgPrimary }}>{p.title}</Text>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>
        {day(p.starts_at)}–{time(p.ends_at)} · {distanceLabel(p.distance)} · {p.host.display_name}
      </Text>
    </Pressable>
  );
}

// S-13 Tonight (F-09). Sport mode shows the activities feed instead (R-09.10, F-11).
export function TonightScreen({ navigation }: { navigation: Nav }) {
  const { me, mode } = useSession();
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const options = useOptions();
  const [win, setWin] = useState<Win>('now4');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [mine, setMine] = useState<MyPlan[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [sports, setSports] = useState<string[]>([]);
  const [sheet, setSheet] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sport = mode === 'sport';

  const load = useCallback(async () => {
    try {
      const v = await api<{ venues: Venue[] }>('GET', `/venues/nearby?mode=${mode}`);
      setErr(null);
      setVenues(v.venues);
      if (sport) {
        const [a, c] = await Promise.all([api<{ posts: Post[] }>('GET', `/activities?sports=${sports.join(',')}`), api<{ clubs: Club[] }>('GET', '/clubs')]);
        setPosts(a.posts);
        setClubs(c.clubs);
      } else {
        const [from, to] = windowRange(win);
        const [t, p] = await Promise.all([
          api<{ plans: Plan[]; mine: MyPlan[] }>('GET', `/tonight?mode=${mode}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
          mode === 'hookup' ? api<{ parties: Party[] }>('GET', '/parties') : Promise.resolve({ parties: [] as Party[] }),
        ]);
        setPlans(t.plans);
        setMine(t.mine);
        setParties(p.parties);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tx.common.error);
      setPlans((x) => x ?? []);
      setPosts((x) => x ?? []);
    }
  }, [mode, sport, sports, win]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  };

  const noLoc = !me.location?.level || me.location.level === 'hidden';
  // S-13 featured parties: mine (hosting / going / requested) first, then the open ones nearby.
  const rank = (p: Party) => (p.my_state === 'host' ? 0 : p.my_state === 'accepted' ? 1 : p.my_state === 'pending' ? 2 : 3);
  const featured = parties.filter((p) => rank(p) < 3 || p.status === 'open' || p.status === 'live').sort((a, b) => rank(a) - rank(b));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.bgBase,
        paddingTop: insets.top + space.s,
      }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: space.l,
          paddingTop: 0,
          gap: space.l,
          paddingBottom: 160,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />}
      >
        <Text accessibilityRole="header" style={{ ...type.display, color: color.fgPrimary }}>
          {sport ? tx.tonight.sportTitle : tx.tonight.title}
        </Text>
        {!sport ? (
          <Chips>
            {(['now2', 'now4', 'late'] as Win[]).map((w) => (
              <Chip key={w} label={tx.tonight.window[w]} on={win === w} fill={accent} onPress={() => setWin(w)} />
            ))}
          </Chips>
        ) : null}
        {noLoc ? <Banner tone="trust" text={tx.tonight.noLocation} /> : null}
        {!me.verified ? <Banner tone="warn" text={tx.tonight.verify} onPress={() => navigation.navigate('Verify')} /> : null}
        {err ? <Banner tone="danger" text={err} onPress={refresh} /> : null}

        {sport ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
              <Chip label={tx.sport.all} on={sports.length === 0} onPress={() => setSports([])} />
              {(options?.options.sports ?? []).map((s) => (
                <Chip key={s} label={opt(s)} on={sports.includes(s)} onPress={() => setSports(sports.includes(s) ? sports.filter((x) => x !== s) : [...sports, s])} />
              ))}
            </ScrollView>
            <View style={{ gap: space.s }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.sport.clubs}</Text>
                <Pressable accessibilityRole="button" onPress={() => navigation.navigate('ClubNew')}>
                  <Text style={{ ...type.meta, color: accent }}>+ {tx.sport.newClub}</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
                {clubs.map((c) => (
                  <Pressable
                    key={c.id}
                    testID={`club-${c.name}`}
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('Club', { id: c.id })}
                    style={{
                      width: 170,
                      padding: space.m,
                      borderRadius: radius.md,
                      backgroundColor: color.bgRaised,
                      gap: 4,
                    }}
                  >
                    <Text numberOfLines={1} style={{ ...type.headline, color: color.fgPrimary }}>
                      {c.verified_club ? '✓ ' : ''}
                      {c.name}
                    </Text>
                    <Text style={{ ...type.meta, color: color.fgSecondary }}>
                      {opt(c.sport)} · {tx.sport.members(c.members)}
                    </Text>
                    {c.my_state ? <Text style={{ ...type.caption, color: accent }}>{c.my_state === 'member' ? tx.sport.joined : tx.sport.pending}</Text> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            {posts === null ? (
              <Loading />
            ) : posts.length === 0 ? (
              <EmptyState title={tx.sport.empty} body={tx.sport.emptyBody} />
            ) : (
              posts.map((p) => (
                <Pressable
                  key={p.id}
                  testID={`post-${p.title}`}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('Activity', { post: p })}
                  style={{
                    padding: space.l,
                    borderRadius: radius.md,
                    backgroundColor: color.bgRaised,
                    gap: space.s,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      style={{
                        ...type.caption,
                        color: accent,
                        textTransform: 'uppercase',
                      }}
                    >
                      {opt(p.sport)}
                    </Text>
                    <Text style={{ ...type.caption, color: color.fgSecondary }}>{tx.sport.going(p.joined, p.capacity)}</Text>
                  </View>
                  <Text style={{ ...type.title, color: color.fgPrimary }}>{p.title}</Text>
                  <Text style={{ ...type.meta, color: color.fgSecondary }}>
                    {day(p.starts_at)}
                    {p.place ? ` · ${p.place}` : ''} · {distanceLabel(p.distance)}
                  </Text>
                  <Text style={{ ...type.meta, color: color.fgMuted }}>
                    {p.club ? p.club.name : p.host.display_name} · {tx.sport.intent[p.intent]}
                  </Text>
                </Pressable>
              ))
            )}
          </>
        ) : (
          <>
            {featured.length ? (
              <View style={{ gap: space.s }}>
                <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.tonight.parties}</Text>
                {featured.map((p) => (
                  <PartyCard key={p.id} p={p} onPress={() => navigation.navigate('Party', { id: p.id })} />
                ))}
              </View>
            ) : null}
            {mine.length ? (
              <View style={{ gap: space.s }}>
                <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.tonight.mine}</Text>
                {mine.map((m) => (
                  <View
                    key={m.id}
                    style={{
                      padding: space.m,
                      borderRadius: 18,
                      borderWidth: 2,
                      borderColor: accent,
                      backgroundColor: color.bgRaised,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.m,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...type.body, color: color.fgPrimary }}>{m.text}</Text>
                      <Text style={{ ...type.meta, color: color.fgSecondary }}>
                        {time(m.window_start)}–{time(m.window_end)} · {tx.tonight.tags[m.tag]} · {tx.tonight.audiences[m.audience]}
                      </Text>
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => api('DELETE', `/tonight/${m.id}`).then(load)}>
                      <Text style={{ ...type.meta, color: color.danger }}>{tx.tonight.remove}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {plans === null ? (
              <Loading />
            ) : plans.length === 0 ? (
              <EmptyState title={tx.tonight.empty} body={tx.tonight.emptyBody} />
            ) : (
              plans.map((p) => (
                <View
                  key={p.id}
                  style={{
                    padding: space.l,
                    borderRadius: 22,
                    backgroundColor: color.bgRaised,
                    gap: space.m,
                  }}
                >
                  <Who
                    p={p.profile}
                    sub={distanceLabel(p.distance)}
                    onPress={() => navigation.navigate('Profile', { id: p.profile.id })}
                    right={
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          navigation.navigate('Chat', {
                            profileId: p.profile.id,
                            name: p.profile.display_name,
                          })
                        }
                        accessibilityLabel={tx.explore.quick.message}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: accent,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon.Chat size={20} c={color.onAccent} />
                      </Pressable>
                    }
                  />
                  <Text style={{ ...type.body, fontSize: 17, lineHeight: 23, color: color.fgPrimary }}>{p.text}</Text>
                  <Chips>
                    <Chip label={`${time(p.window_start)}–${time(p.window_end)}`} on={false} onPress={() => {}} />
                    <Chip label={tx.tonight.tags[p.tag]} on fill={accent} onPress={() => {}} />
                  </Chips>
                </View>
              ))
            )}
          </>
        )}

        {venues.length ? (
          <View>
            <Text
              style={{
                ...type.headline,
                color: color.fgPrimary,
                marginBottom: space.xs,
              }}
            >
              {tx.tonight.venues}
            </Text>
            {venues.slice(0, 5).map((v) => (
              <ListRow key={v.id} testID={`venue-${v.name}`} title={`${tx.venue.kinds[v.kind]} · ${v.name}`} sub={`${distanceLabel(v.distance)} · ${tx.venue.here(v.here)}`} onPress={() => navigation.navigate('Venue', { venue: v })} />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: space.l,
          right: space.l,
          bottom: insets.bottom + 76,
          flexDirection: 'row',
          gap: space.s,
        }}
      >
        <View style={{ flex: 1 }}>
          <Button testID="tonight-post" title={sport ? tx.sport.post : tx.tonight.post} fill={color.fgPrimary} onPress={() => (sport ? navigation.navigate('ActivityNew') : setSheet(true))} disabled={!me.verified} />
        </View>
        {mode === 'hookup' ? (
          <View style={{ flex: 1 }}>
            <Button testID="tonight-host" kind="secondary" title={tx.tonight.host} onPress={() => navigation.navigate('PartyNew')} disabled={!me.verified} />
          </View>
        ) : null}
      </View>
      <PlanSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        onDone={() => {
          setSheet(false);
          load();
        }}
        mode={mode}
      />
    </View>
  );
}
