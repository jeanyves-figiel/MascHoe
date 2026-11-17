import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, ApiError } from "../api/client";
import { useSession } from "../app/session";
import { distanceLabel, tx } from "../i18n/app";
import { color, space, type } from "../theme/tokens";
import {
  Badge,
  Banner,
  Button,
  ErrorText,
  Field,
  ListRow,
  Loading,
  Toggle,
  useAccent,
} from "../ui";
import { Who } from "./TonightScreen";
import type { Here, Venue } from "./types";

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void };

// S-17 Venue (F-12): check in (visible toggle, optional zone), see who is here, check out.
export function VenueScreen({
  navigation,
  route,
}: {
  navigation: Nav;
  route: { params: { venue: Venue } };
}) {
  const v = route.params.venue;
  const { me, mode } = useSession();
  const accent = useAccent();
  const [here, setHere] = useState<Here | null | undefined>(undefined);
  const [visible, setVisible] = useState(true);
  const [zone, setZone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const safe = me.safe_mode === "on" || !!me.safe_mode_active;

  const load = useCallback(
    () =>
      api<Here>("GET", `/venues/${v.id}/here`).then(
        (h) => {
          setHere(h);
          setVisible(h.me.visible);
        },
        (e) =>
          setHere(
            e instanceof ApiError && e.status === 403
              ? null
              : (setErr(tx.common.error), null),
          ),
      ),
    [v.id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const call = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message)
          : tx.common.error,
      );
    } finally {
      setBusy(false);
    }
  };

  if (here === undefined) return <Loading />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgBase }}
      contentContainerStyle={{
        padding: space.l,
        gap: space.l,
        paddingBottom: 120,
      }}
    >
      <View style={{ flexDirection: "row", gap: space.s }}>
        <Badge label={tx.venue.kinds[v.kind] ?? v.kind} fill={accent} />
        <Badge label={distanceLabel(v.distance)} fill={color.trust} />
      </View>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{v.name}</Text>
      <ErrorText text={err} />

      {here ? (
        <>
          <Text
            testID="venue-stats"
            style={{ ...type.meta, color: color.fgSecondary }}
          >
            {tx.venue.stats(
              here.stats.total,
              here.stats.visible_to_you,
              here.stats.tapped_you,
            )}
          </Text>
          <Toggle
            label={tx.venue.visible}
            value={visible}
            tone={color.trust}
            onChange={(x) =>
              call(() =>
                api("PATCH", `/venues/${v.id}/checkin`, { visible: x }),
              )
            }
          />
          {!here.me.visible ? (
            <Banner tone="warn" text={tx.venue.hidden} />
          ) : null}
          {here.me.visible && here.people.length === 0 ? (
            <Text style={{ ...type.meta, color: color.fgMuted }}>
              {tx.venue.empty}
            </Text>
          ) : null}
          {here.people.map((x) => (
            <Who
              key={x.profile.id}
              p={x.profile}
              sub={
                [x.zone, x.tapped_me ? tx.profile.tappedYou : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              onPress={() =>
                navigation.navigate("Profile", { id: x.profile.id })
              }
            />
          ))}
          <ListRow
            testID="venue-checkout"
            title={tx.venue.checkout}
            danger
            onPress={() => call(() => api("POST", "/venues/checkout"))}
          />
        </>
      ) : (
        <>
          <Text style={{ ...type.body, color: color.fgSecondary }}>
            {tx.venue.here(v.here)}
          </Text>
          {safe ? (
            <Banner tone="warn" text={tx.venue.safe} />
          ) : (
            <>
              <Toggle
                label={tx.venue.visible}
                value={visible}
                tone={color.trust}
                onChange={setVisible}
              />
              <Field
                testID="venue-zone"
                label={tx.venue.zone}
                value={zone}
                onChangeText={setZone}
                maxLength={40}
              />
              <Button
                testID="venue-checkin"
                title={tx.venue.checkin}
                busy={busy}
                disabled={!me.verified}
                onPress={() =>
                  call(() =>
                    api("POST", `/venues/${v.id}/checkin?mode=${mode}`, {
                      visible,
                      zone: zone.trim() || null,
                    }),
                  )
                }
              />
              {!me.verified ? (
                <Text style={{ ...type.meta, color: color.fgMuted }}>
                  {tx.common.verifyToDo}
                </Text>
              ) : null}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
