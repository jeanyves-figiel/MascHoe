import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import type { Me } from "../api/client";
import type { ExploreSummary, Mode } from "../api/types";
import { tx } from "../i18n/app";
import { v3 } from "../i18n/v3";
import {
  color,
  font,
  modeColor,
  motion,
  radius,
  space,
  type,
} from "../theme/tokens";
import { Icon, Wordmark } from "../ui";
import { countLabel } from "./explore";

const MODES: Mode[] = ["hookup", "friends", "sport"];
const h = v3.header;

/** Mode icons (24 grid, rounded strokes, same set as icons.tsx). */
function ModeIcon({ mode, c }: { mode: Mode; c: string }) {
  const p = {
    fill: "none",
    stroke: c,
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      {mode === "hookup" ? (
        <Path
          d="M12 22c4 0 7-2.8 7-7 0-4-3-6.5-4-9.5-1.5 2-2 3.5-2 5-1.5-1-3-3-3-6C6.5 7 5 11 5 15c0 4.2 3 7 7 7z"
          {...p}
        />
      ) : null}
      {mode === "friends" ? (
        <>
          <Circle cx={9} cy={8} r={3.5} {...p} />
          <Path
            d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"
            {...p}
          />
        </>
      ) : null}
      {mode === "sport" ? (
        <Path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" {...p} />
      ) : null}
    </Svg>
  );
}

/** Soft radial glow of one mode colour (22 %), fading into ink. */
function Glow({ mode }: { mode: Mode }) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <Defs>
        <RadialGradient id={`g-${mode}`} cx="50%" cy="20%" rx="60%" ry="70%">
          <Stop offset="0" stopColor={modeColor[mode]} stopOpacity={0.22} />
          <Stop offset="1" stopColor={modeColor[mode]} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d="M0 0H100V100H0z" fill={`url(#g-${mode})`} />
    </Svg>
  );
}

type Props = {
  me: Me;
  mode: Mode;
  onMode: (m: Mode) => void;
  summary: ExploreSummary | null;
  filtersOn: number;
  topInset: number;
  onFilters: () => void;
  onLocation: () => void;
  onNow: () => void;
  banner?: React.ReactNode;
};

// S-10 live header (F-04 R-04.17, #104; mockup option A).
export function LiveHeader({
  me,
  mode,
  onMode,
  summary,
  filtersOn,
  topInset,
  onFilters,
  onLocation,
  onNow,
  banner,
}: Props) {
  const accent = modeColor[mode];
  const [reduce, setReduce] = useState(false);
  const [fades] = useState(
    () =>
      Object.fromEntries(
        MODES.map((m) => [m, new Animated.Value(m === mode ? 1 : 0)]),
      ) as Record<Mode, Animated.Value>,
  );

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduce)
      .catch(() => {});
  }, []);

  useEffect(() => {
    MODES.forEach((m) => {
      const to = m === mode ? 1 : 0;
      if (reduce) fades[m].setValue(to);
      else
        Animated.timing(fades[m], {
          toValue: to,
          duration: motion.slow,
          useNativeDriver: true,
        }).start();
    });
  }, [mode, reduce, fades]);

  const level = me.incognito ? "incognito" : (me.location?.level ?? "city");
  const place = summary ? (summary.place ?? h.somewhere) : " ";
  const around = summary ? countLabel(summary.counts[mode]) : "·";
  const nowN = summary ? countLabel(summary.now) : "·";
  const p = me.profile ?? me.profiles?.[0];
  const photo = p?.photos.find((x) => x.slot === 0)?.url ?? null;
  const initials = (p?.display_name ?? "?").slice(0, 2).toUpperCase();
  const nowOn = !!me.now;

  return (
    <View
      style={{
        paddingTop: topInset + space.s,
        paddingHorizontal: space.l,
        paddingBottom: space.s,
        gap: 14,
      }}
    >
      {/* R-04.17 glow, cross-fades on mode switch */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: -80,
          right: -80,
          top: -120,
          height: 420,
        }}
      >
        {MODES.map((m) => (
          <Animated.View
            key={m}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: fades[m],
            }}
          >
            <Glow mode={m} />
          </Animated.View>
        ))}
      </View>

      {/* Row 1: wordmark · filters · own avatar (Now) */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Wordmark size={26} />
        </View>
        <Pressable
          testID="filters-btn"
          accessibilityRole="button"
          accessibilityLabel={h.filters(filtersOn)}
          onPress={onFilters}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: color.bgRaised,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Icon.Filter size={20} />
          {filtersOn > 0 ? (
            <View
              style={{
                position: "absolute",
                top: 3,
                right: 3,
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
              width: 44,
              height: 44,
              borderRadius: 22,
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
              width: 34,
              height: 34,
              borderRadius: 17,
              overflow: "hidden",
              backgroundColor: color.bgOverlay,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {photo ? (
              <Image
                source={{ uri: photo }}
                style={{ width: 34, height: 34 }}
              />
            ) : (
              <Text
                style={{
                  fontFamily: font.heavy,
                  fontSize: 13,
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
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: accent,
              borderWidth: 2,
              borderColor: color.bgBase,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {nowOn ? null : <Icon.Plus size={8} c={color.onAccent} w={4} />}
          </View>
        </Pressable>
      </View>

      {/* Row 2: place + level chip + live counts → Location sheet */}
      <Pressable
        testID="location-pill"
        accessibilityRole="button"
        accessibilityLabel={`${place}, ${h.level[level] ?? level}. ${around} ${h.around}${mode === "sport" ? "" : `, ${nowN} ${h.now}`}. ${h.changeLocation}`}
        onPress={onLocation}
        style={({ pressed }) => [{ gap: 4 }, pressed && { opacity: 0.85 }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              ...type.display,
              fontSize: 30,
              lineHeight: 34,
              letterSpacing: -1.2,
              color: color.fgPrimary,
              flexShrink: 1,
            }}
          >
            {place}
          </Text>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke={color.fgSecondary}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <View
            style={{
              height: 24,
              paddingHorizontal: 9,
              borderRadius: 12,
              backgroundColor: "rgba(61,214,195,0.14)",
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Icon.Pin size={12} c={color.trust} w={2.6} />
            <Text
              style={{
                fontFamily: font.bold,
                fontSize: 13,
                color: color.trust,
              }}
            >
              {h.level[level] ?? level}
            </Text>
          </View>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: accent,
              marginHorizontal: 3,
              shadowColor: accent,
              shadowOpacity: 0.8,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
          <Text style={{ ...type.meta, color: color.fgSecondary }}>
            <Text style={{ fontFamily: font.heavy, color: color.fgPrimary }}>
              {around}
            </Text>{" "}
            {h.around}
            {mode === "sport" ? null : (
              <>
                {" · "}
                <Text
                  style={{ fontFamily: font.heavy, color: color.fgPrimary }}
                >
                  {nowN}
                </Text>{" "}
                {h.now}
              </>
            )}
          </Text>
        </View>
      </Pressable>

      {/* Row 3: mode tiles with counts */}
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Mode"
        style={{ flexDirection: "row", gap: space.s }}
      >
        {MODES.map((m) => {
          const sel = m === mode;
          const c = modeColor[m];
          const n = summary ? countLabel(summary.counts[m]) : "·";
          return (
            <Pressable
              key={m}
              testID={`mode-${m}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={h.mode(tx.modes[m], n)}
              onPress={() => onMode(m)}
              style={({ pressed }) => [
                {
                  flex: 1,
                  height: 74,
                  borderRadius: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  justifyContent: "space-between",
                  backgroundColor: sel ? c : color.bgRaised,
                  shadowColor: c,
                  shadowOpacity: sel ? 0.35 : 0,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: sel ? 6 : 0,
                },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: sel ? "rgba(23,20,46,0.14)" : c + "38",
                  }}
                >
                  <ModeIcon mode={m} c={sel ? color.onAccent : c} />
                </View>
                <Text
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 13,
                    color: sel ? color.onAccent : color.fgSecondary,
                  }}
                >
                  {n}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: font.heavy,
                  fontSize: 15,
                  letterSpacing: -0.3,
                  color: sel ? color.onAccent : color.fgPrimary,
                }}
              >
                {tx.modes[m]}
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
