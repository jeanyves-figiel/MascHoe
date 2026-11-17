import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, ApiError } from "../api/client";
import { useSession } from "../app/session";
import { tx } from "../i18n/app";
import { color, space, type } from "../theme/tokens";
import {
  Banner,
  Button,
  Chip,
  Chips,
  ErrorText,
  Field,
  useAccent,
} from "../ui";
import type { Party } from "./types";

type Nav = {
  navigate: (s: string, p?: object) => void;
  replace: (s: string, p?: object) => void;
};
const CHIPS = [
  "age_range",
  "safer",
  "prep",
  "vers_welcome",
  "no_chems",
  "sober_friendly",
  "bring_toys",
  "dress_code",
];

// S-15 Create party (R-10.1). Approximate area is taken from your location (r8 cell), never an address.
export function PartyNewScreen({ navigation }: { navigation: Nav }) {
  const { me } = useSession();
  const accent = useAccent();
  const [title, setTitle] = useState("");
  const [startIn, setStartIn] = useState(1);
  const [hours, setHours] = useState(4);
  const [cap, setCap] = useState(6);
  const [rules, setRules] = useState<string[]>(["safer"]);
  const [custom, setCustom] = useState("");
  const [aud, setAud] = useState<"verified" | "chats" | "invite">("verified");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const safe = me.safe_mode === "on" || me.safe_mode_active;

  const starts = () => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() + startIn * 3600e3);
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const s = starts();
      const p = await api<Party>("POST", "/parties", {
        title: title.trim(),
        starts_at: s.toISOString(),
        ends_at: new Date(s.getTime() + hours * 3600e3).toISOString(),
        capacity: cap,
        rules,
        audience: aud,
      });
      navigation.replace("Party", { id: p.id });
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

  const customRules = rules.filter((r) => !CHIPS.includes(r));
  const label = (h: number) => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() + h * 3600e3).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
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
      <Text style={{ ...type.display, color: color.fgPrimary }}>
        {tx.party.create}
      </Text>
      {safe ? <Banner tone="personal" text={tx.party.safeMode} /> : null}
      <Field
        testID="party-title"
        label={tx.party.name}
        value={title}
        onChangeText={setTitle}
        maxLength={40}
      />
      <View style={{ gap: space.xs }}>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>
          {tx.party.starts}
        </Text>
        <Chips>
          {[1, 2, 3, 4, 5, 6, 8, 24].map((h) => (
            <Chip
              key={h}
              label={label(h)}
              on={startIn === h}
              fill={accent}
              onPress={() => setStartIn(h)}
            />
          ))}
        </Chips>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>
          {tx.party.duration}
        </Text>
        <Chips>
          {[2, 3, 4, 6, 8, 12].map((h) => (
            <Chip
              key={h}
              label={tx.party.hours(h)}
              on={hours === h}
              fill={accent}
              onPress={() => setHours(h)}
            />
          ))}
        </Chips>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>
          {tx.party.capacity}
        </Text>
        <Chips>
          {[2, 3, 4, 6, 8, 10, 15, 20, 30, 50].map((n) => (
            <Chip
              key={n}
              label={String(n)}
              on={cap === n}
              fill={accent}
              onPress={() => setCap(n)}
            />
          ))}
        </Chips>
      </View>
      <View style={{ gap: space.xs }}>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>
          {tx.party.rules}
        </Text>
        <Chips>
          {CHIPS.map((r) => (
            <Chip
              key={r}
              label={tx.party.rule[r]}
              on={rules.includes(r)}
              fill={accent}
              onPress={() =>
                setRules(
                  rules.includes(r)
                    ? rules.filter((x) => x !== r)
                    : [...rules, r],
                )
              }
            />
          ))}
          {customRules.map((r) => (
            <Chip
              key={r}
              label={`${r} ✕`}
              on
              fill={accent}
              onPress={() => setRules(rules.filter((x) => x !== r))}
            />
          ))}
        </Chips>
        {customRules.length < 3 ? (
          <View
            style={{
              flexDirection: "row",
              gap: space.s,
              alignItems: "flex-end",
            }}
          >
            <View style={{ flex: 1 }}>
              <Field
                label={tx.party.customRule}
                value={custom}
                onChangeText={setCustom}
                maxLength={30}
              />
            </View>
            <Button
              small
              kind="secondary"
              title={tx.party.addRule}
              disabled={!custom.trim()}
              onPress={() => {
                setRules([...rules, custom.trim()]);
                setCustom("");
              }}
            />
          </View>
        ) : null}
      </View>
      <View style={{ gap: space.xs }}>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>
          {tx.tonight.audience}
        </Text>
        <Chips>
          {(["verified", "chats", "invite"] as const).map((a) => (
            <Chip
              key={a}
              label={tx.tonight.audiences[a]}
              on={aud === a}
              fill={color.trust}
              onPress={() => setAud(a)}
            />
          ))}
        </Chips>
      </View>
      <Text style={{ ...type.meta, color: color.trust }}>
        📍 {tx.party.area}
      </Text>
      <ErrorText text={err} />
      <Button
        testID="party-create"
        title={tx.party.create}
        busy={busy}
        disabled={!title.trim() || safe}
        onPress={create}
      />
    </ScrollView>
  );
}
