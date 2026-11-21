import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { Me } from "../api/client";
import type { ExploreSummary, Mode } from "../api/types";
import { tx } from "../i18n/app";
import { pl } from "../i18n/places";
import { v3 } from "../i18n/v3";
import { color, font, modeColor, radius, space, type } from "../theme/tokens";
import { Icon, Wordmark } from "../ui";
import { countLabel } from "./explore";
import { INTENTS } from "./mapShared";

const h = v3.header;
const glass = color.glass;

type Props = {
  me: Me;
  intents: Mode[];
  onIntent: (m: Mode) => void;
  summary: ExploreSummary | null;
  filtersOn: number;
  topInset: number;
  onFilters: () => void;
  onLocation: () => void;
  onNow: () => void;
  banner?: React.ReactNode;
};

// S-10 floating header over the full-bleed map (F-04 R-04.18, #113 option B):
// glass bar (wordmark · place + level + counts · Filters · own avatar) and the intent chips.
export function LiveHeader({
  me,
  intents,
  onIntent,
  summary,
  filtersOn,
  topInset,
  onFilters,
  onLocation,
  onNow,
  banner,
}: Props) {
  const accent = modeColor[intents[0] ?? "hookup"];
  const sportOnly = intents.length === 1 && intents[0] === "sport";
  const level = me.location?.level ?? "city";
  const place = summary ? (summary.place ?? h.somewhere) : " ";
  const around = summary
    ? countLabel(summary.total ?? summary.counts[intents[0]])
    : "·";
  const nowN = summary ? countLabel(summary.now) : "·";
  const p = me.profile ?? me.profiles?.[0];
  const photo = p?.photos.find((x) => x.slot === 0)?.url ?? null;
  const initials = (p?.display_name ?? "?").slice(0, 2).toUpperCase();
  const nowOn = !!me.now;
  const shadow = {
    shadowColor: color.shadow,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        paddingHorizontal: 12,
        paddingTop: topInset + space.xs,
        paddingBottom: space.s,
        gap: 10,
      }}
    >
      <View
        style={{
          height: 56,
          borderRadius: 28,
          paddingLeft: space.l,
          paddingRight: space.s,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: glass,
          borderWidth: 1,
          borderColor: color.line,
          ...shadow,
        }}
      >
        <Wordmark size={22} />
        <Pressable
          testID="location-pill"
          accessibilityRole="button"
          accessibilityLabel={`${place}, ${h.level[level] ?? level}. ${around} ${h.around}${sportOnly ? "" : `, ${nowN} ${h.now}`}. ${h.changeLocation}`}
          onPress={onLocation}
          style={({ pressed }) => [
            { flex: 1, minWidth: 0 },
            pressed && { opacity: 0.8 },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{
                ...type.headline,
                fontSize: 14,
                lineHeight: 18,
                color: color.fgPrimary,
                flexShrink: 1,
              }}
            >
              {place}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.heavy,
                fontSize: 10,
                letterSpacing: 0.4,
                color: color.trust,
              }}
            >
              {(h.level[level] ?? level).toUpperCase()}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{ ...type.meta, fontSize: 12, lineHeight: 16, color: color.fgSecondary }}
          >
            <Text style={{ fontFamily: font.heavy, color: color.fgPrimary }}>
              {around}
            </Text>{" "}
            {h.around}
            {sportOnly ? null : (
              <>
                {" · "}
                <Text style={{ fontFamily: font.heavy, color: color.fgPrimary }}>
                  {nowN}
                </Text>{" "}
                {h.now}
              </>
            )}
          </Text>
        </Pressable>
        <Pressable
          testID="filters-btn"
          accessibilityRole="button"
          accessibilityLabel={h.filters(filtersOn)}
          onPress={onFilters}
          style={({ pressed }) => [
            {
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: color.bgRaised,
              borderWidth: 1,
              borderColor: color.line,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Icon.Filter size={18} />
          {filtersOn > 0 ? (
            <View
              style={{
                position: "absolute",
                top: 1,
                right: 1,
                minWidth: 16,
                height: 16,
                paddingHorizontal: 3,
                borderRadius: 8,
                backgroundColor: color.fgPrimary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: font.heavy,
                  fontSize: 10,
                  lineHeight: 12,
                  color: color.onAccent,
                }}
              >
                {filtersOn}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          testID="now-btn"
          accessibilityRole="button"
          accessibilityLabel={nowOn ? h.nowOn : h.nowOff}
          onPress={onNow}
          style={({ pressed }) => [
            {
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 2,
              borderStyle: nowOn ? "solid" : "dashed",
              borderColor: accent,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              overflow: "hidden",
              backgroundColor: color.bgOverlay,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={{ width: 30, height: 30 }} />
            ) : (
              <Text
                style={{
                  fontFamily: font.heavy,
                  fontSize: 12,
                  color: color.fgPrimary,
                }}
              >
                {initials}
              </Text>
            )}
          </View>
          <View
            style={{
              position: "absolute",
              right: -3,
              bottom: -3,
              width: 15,
              height: 15,
              borderRadius: 8,
              backgroundColor: accent,
              borderWidth: 2,
              borderColor: color.bgBase,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {nowOn ? null : <Icon.Plus size={7} c={color.onAccent} w={4} />}
          </View>
        </Pressable>
      </View>

      {/* R-04.18 intent chips: multi-select, the last one stays on */}
      <View
        accessibilityLabel={pl.intentsLabel}
        style={{ flexDirection: "row", gap: 6 }}
      >
        {INTENTS.map((m) => {
          const on = intents.includes(m);
          const c = modeColor[m];
          const n = summary ? countLabel(summary.counts[m]) : "·";
          return (
            <Pressable
              key={m}
              testID={`intent-${m}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={pl.intent(tx.modes[m], n)}
              onPress={() => onIntent(m)}
              style={({ pressed }) => [
                {
                  flexGrow: 1,
                  flexShrink: 1,
                  height: 36,
                  paddingLeft: 8,
                  paddingRight: 10,
                  justifyContent: "center",
                  borderRadius: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  backgroundColor: glass,
                  borderWidth: 1,
                  borderColor: on ? c : color.line,
                  ...shadow,
                  shadowOpacity: 0.3,
                },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
            >
              <View
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 7,
                  borderWidth: 3.5,
                  borderColor: on ? c : color.navInactive,
                }}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: font.heavy,
                  fontSize: 13,
                  flexShrink: 1,
                  color: on ? color.fgPrimary : color.fgMuted,
                }}
              >
                {tx.modes[m]}
              </Text>
              <Text
                style={{
                  fontFamily: font.medium,
                  fontSize: 12,
                  color: color.fgSecondary,
                }}
              >
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {banner}
    </View>
  );
}

/** R-04.17: slim verify row at the top of the grid sheet (replaces the header banner). */
export function VerifyRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      testID="verify-row"
      accessibilityRole="button"
      accessibilityLabel={h.verifyRow}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: radius.tray,
          backgroundColor: "rgba(61,214,195,0.10)",
          marginBottom: space.l,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Icon.Shield size={22} c={color.trust} />
      <Text
        style={{
          ...type.meta,
          fontFamily: font.bold,
          fontSize: 14,
          color: color.fgSoft,
          flex: 1,
        }}
      >
        {h.verifyRow}
      </Text>
      <Text
        style={{ fontFamily: font.heavy, fontSize: 14, color: color.trust }}
      >
        {h.verify}
      </Text>
    </Pressable>
  );
}
