import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { api, ApiError } from "../api/client";
import { kindForMode } from "../api/types";
import { useSession } from "../app/session";
import * as E from "../chat/engine";
import { kv } from "../chat/kv";
import { distanceLabel, tx } from "../i18n/app";
import { color, font, radius, space, type } from "../theme/tokens";
import {
  Banner,
  Badge,
  Button,
  ErrorText,
  ListRow,
  Loading,
  Sheet,
  useAccent,
} from "../ui";
import { resyncHostGroups } from "./groupSync";
import { Who } from "./TonightScreen";
import type { Party } from "./types";
import { day, time } from "./types";

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void };

/** Opens the party guest chat; the host keeps the MLS group in sync with accepted guests. */
export async function openPartyChat(p: Party, myProfile: string) {
  const host = p.my_state === "host";
  const c = await E.openGroup("party:" + p.id, myProfile, p.title, host);
  if (host) {
    const guests = (p.requests ?? [])
      .filter((r) => r.state === "accepted")
      .map((r) => ({ id: r.profile.id, name: r.profile.display_name }));
    await E.syncGroup(c.id, [
      { id: myProfile, name: p.host.display_name },
      ...guests,
    ]);
  }
  return c;
}

// S-14 Party detail (F-10): host view with requests, guest view with status.
export function PartyScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route: { params: { id: string; code?: string } };
}) {
  const { me } = useSession();
  const accent = useAccent();
  const [p, setP] = useState<Party | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const mine =
    (me.profiles ?? []).find((x) => x.kind === kindForMode.hookup) ??
    me.profile;

  const load = useCallback(
    () =>
      api<Party>(
        "GET",
        `/parties/${route.params.id}${route.params.code ? `?code=${route.params.code}` : ""}`,
      ).then(setP, (e) =>
        setErr(e instanceof ApiError ? e.message : tx.common.error),
      ),
    [route.params.id, route.params.code],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!p) return err ? <Banner tone="danger" text={err} /> : <Loading />;
  const host = p.my_state === "host";
  const live = p.status !== "ended" && p.status !== "cancelled";

  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    setErr(null);
    try {
      const r = await fn();
      if (r && typeof r === "object" && "id" in (r as object)) setP(r as Party);
      else await load();
      if (host && /^[ar]/.test(k)) resyncHostGroups().catch(() => {});
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message)
          : tx.common.error,
      );
    } finally {
      setBusy(null);
    }
  };

  const chat = async () => {
    if (!mine) return;
    const c = await openPartyChat(p, mine.id);
    navigation.navigate("Chat", { cid: c.id });
  };

  // R-10.5: address & door code typed on the host's phone, sent E2EE to accepted guests only.
  const sendAddress = async () => {
    if (!mine || !addr.trim()) return;
    await kv.set("party:addr", addr.trim());
    const c = await openPartyChat(p, mine.id);
    await E.send(c.id, { t: "text", text: "📍 " + addr.trim() });
    setAddrOpen(false);
    navigation.navigate("Chat", { cid: c.id });
  };

  const accepted = (p.requests ?? []).filter((r) => r.state === "accepted");
  const pending = (p.requests ?? []).filter((r) => r.state === "pending");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgBase }}
      contentContainerStyle={{
        padding: space.l,
        gap: space.l,
        paddingBottom: 120,
      }}
    >
      <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap" }}>
        <Badge label={tx.party.status[p.status]} fill={accent} />
        <Badge
          label={tx.party.seats(p.seats_taken, p.capacity)}
          fill={color.bgInverse}
        />
        <Badge label={tx.tonight.audiences[p.audience]} fill={color.trust} />
      </View>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{p.title}</Text>
      <Text style={{ ...type.body, color: color.fgSecondary }}>
        {day(p.starts_at)}–{time(p.ends_at)} · {distanceLabel(p.distance)}
      </Text>
      <Who
        p={p.host}
        sub={tx.party.title}
        onPress={() => navigation.navigate("Profile", { id: p.host.id })}
      />
      {p.rules.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
          {p.rules.map((r) => (
            <Badge
              key={r}
              label={tx.party.rule[r] ?? r}
              fill={color.bgOverlay}
            />
          ))}
        </View>
      ) : null}
      <Text style={{ ...type.meta, color: color.trust }}>
        📍 {tx.party.area}
      </Text>
      {p.rating ? (
        <Text style={{ ...type.meta, color: color.fgSecondary }}>
          👍 {p.rating.up}/{p.rating.total}
        </Text>
      ) : null}
      <ErrorText text={err} />

      {host ? (
        <>
          {p.invite_code ? (
            <Banner
              tone="trust"
              text={`${tx.party.inviteLink}: ${p.invite_code}`}
            />
          ) : null}
          <Button
            testID="party-chat"
            title={tx.party.guestChat}
            onPress={chat}
            disabled={!accepted.length}
          />
          <Button
            testID="party-address"
            kind="secondary"
            title={tx.party.sendAddress}
            disabled={!accepted.length}
            onPress={() =>
              kv.get<string>("party:addr").then((a) => {
                setAddr(a ?? "");
                setAddrOpen(true);
              })
            }
          />
          <Text style={{ ...type.headline, color: color.fgPrimary }}>
            {tx.party.requests}
          </Text>
          {pending.length === 0 ? (
            <Text style={{ ...type.meta, color: color.fgMuted }}>
              {tx.party.noRequests}
            </Text>
          ) : null}
          {pending.map((r) => (
            <View
              key={r.profile.id}
              style={{
                padding: space.m,
                borderRadius: radius.md,
                backgroundColor: color.bgRaised,
                gap: space.s,
              }}
            >
              <Who
                p={r.profile}
                sub={r.profile.verified ? tx.me.verified : undefined}
                onPress={() =>
                  navigation.navigate("Profile", { id: r.profile.id })
                }
              />
              <View style={{ flexDirection: "row", gap: space.s }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`accept-${r.profile.display_name}`}
                    small
                    title={tx.party.accept}
                    busy={busy === "a" + r.profile.id}
                    onPress={() =>
                      run("a" + r.profile.id, () =>
                        api(
                          "POST",
                          `/parties/${p.id}/requests/${r.profile.id}/accept`,
                        ),
                      )
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    small
                    kind="secondary"
                    title={tx.party.decline}
                    onPress={() =>
                      run("d" + r.profile.id, () =>
                        api(
                          "POST",
                          `/parties/${p.id}/requests/${r.profile.id}/decline`,
                        ),
                      )
                    }
                  />
                </View>
              </View>
            </View>
          ))}
          <Text style={{ ...type.headline, color: color.fgPrimary }}>
            {tx.party.guests}
          </Text>
          {accepted.map((r) => (
            <Who
              key={r.profile.id}
              p={r.profile}
              onPress={() =>
                navigation.navigate("Profile", { id: r.profile.id })
              }
              right={
                <Text
                  onPress={() =>
                    run("r" + r.profile.id, () =>
                      api(
                        "POST",
                        `/parties/${p.id}/requests/${r.profile.id}/remove`,
                      ),
                    )
                  }
                  style={{ ...type.meta, color: color.danger }}
                >
                  {tx.party.removeGuest}
                </Text>
              }
            />
          ))}
          {live ? (
            <View>
              <ListRow
                title={
                  p.status === "full" ? tx.party.reopen : tx.party.markFull
                }
                onPress={() =>
                  run("s", () =>
                    api("PATCH", `/parties/${p.id}`, {
                      status: p.status === "full" ? "open" : "full",
                    }),
                  )
                }
              />
              <ListRow
                title={tx.party.end}
                onPress={() =>
                  run("s", () =>
                    api("PATCH", `/parties/${p.id}`, { status: "ended" }),
                  )
                }
              />
              <ListRow
                title={tx.party.cancel}
                danger
                onPress={() =>
                  run("s", () =>
                    api("PATCH", `/parties/${p.id}`, { status: "cancelled" }),
                  )
                }
              />
            </View>
          ) : null}
        </>
      ) : (
        <>
          {p.my_state === null || p.my_state === "left" ? (
            <Button
              testID="party-request"
              title={tx.party.request}
              busy={busy === "req"}
              disabled={!live || !me.verified}
              onPress={() =>
                run("req", () =>
                  api("POST", `/parties/${p.id}/request`, {
                    code: route.params.code,
                  }),
                )
              }
            />
          ) : p.my_state === "pending" ? (
            <Banner tone="trust" text={tx.party.requested} />
          ) : p.my_state === "accepted" ? (
            <>
              <Banner tone="personal" text={tx.party.accepted} />
              <Text style={{ ...type.meta, color: color.fgSecondary }}>
                {tx.party.checkinTip}
              </Text>
              <Button
                testID="party-chat"
                title={tx.party.guestChat}
                onPress={chat}
              />
            </>
          ) : (
            <Banner tone="warn" text={tx.party.notThisTime} />
          )}
          {p.my_state === "pending" || p.my_state === "accepted" ? (
            <ListRow
              title={tx.party.leave}
              onPress={() =>
                run("l", () => api("POST", `/parties/${p.id}/leave`))
              }
            />
          ) : null}
          {p.status === "ended" && p.my_state === "accepted" ? (
            <View
              style={{
                flexDirection: "row",
                gap: space.s,
                alignItems: "center",
              }}
            >
              <Text style={{ ...type.body, color: color.fgPrimary, flex: 1 }}>
                {tx.party.rate}
              </Text>
              <Button
                small
                kind="secondary"
                title="👍"
                onPress={() =>
                  run("rate", () =>
                    api("POST", `/parties/${p.id}/rate`, { up: true }),
                  )
                }
              />
              <Button
                small
                kind="secondary"
                title="👎"
                onPress={() =>
                  run("rate", () =>
                    api("POST", `/parties/${p.id}/rate`, { up: false }),
                  )
                }
              />
            </View>
          ) : null}
          <ListRow
            title={tx.party.report}
            danger
            onPress={() =>
              api("POST", `/parties/${p.id}/report`, { reason: "user" }).then(
                () => setNote(tx.party.reported),
              )
            }
          />
          {note ? <Banner tone="trust" text={note} /> : null}
        </>
      )}

      <Sheet
        visible={addrOpen}
        onClose={() => setAddrOpen(false)}
        title={tx.party.sendAddress}
        closeLabel={tx.common.close}
      >
        <Text style={{ ...type.meta, color: color.trust }}>
          🔒 {tx.party.addressHint}
        </Text>
        <TextInput
          testID="party-addr"
          value={addr}
          onChangeText={setAddr}
          placeholder={tx.party.addressTemplate}
          placeholderTextColor={color.fgMuted}
          multiline
          style={{
            minHeight: 90,
            borderRadius: radius.md,
            backgroundColor: color.bgRaised,
            color: color.fgPrimary,
            padding: space.m,
            fontFamily: font.regular,
            fontSize: 15,
          }}
        />
        <Button
          testID="party-addr-send"
          title={tx.party.sendAddress}
          disabled={!addr.trim()}
          onPress={sendAddress}
        />
      </Sheet>
    </ScrollView>
  );
}
