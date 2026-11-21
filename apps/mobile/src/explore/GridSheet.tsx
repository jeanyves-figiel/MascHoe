import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';

export type Snap = 'peek' | 'half' | 'full';
export const SNAPS: Snap[] = ['peek', 'half', 'full'];

/** Visible sheet height per snap (R-04.14). `h` = Explore body height, `bottom` = space taken by the floating tab bar. */
export function snapHeight(snap: Snap, h: number, bottom: number): number {
  if (snap === 'full') return h;
  if (snap === 'half') return Math.min(h, Math.round(h * 0.5) + 40);
  return Math.min(h, bottom + 150);
}

/** Snap after a drag: a fling goes one step in its direction, otherwise the nearest snap. */
export function snapAfterDrag(visible: number, vy: number, h: number, bottom: number, from: Snap): Snap {
  const i = SNAPS.indexOf(from);
  if (vy < -0.5) return SNAPS[Math.min(SNAPS.length - 1, i + 1)];
  if (vy > 0.5) return SNAPS[Math.max(0, i - 1)];
  let best: Snap = from;
  let dist = Infinity;
  for (const s of SNAPS) {
    const d = Math.abs(snapHeight(s, h, bottom) - visible);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

const spring = (v: Animated.Value, to: number) => Animated.spring(v, { toValue: to, useNativeDriver: true, damping: 20, stiffness: 180, mass: 1 }).start();

const NEXT: Record<Snap, Snap> = { peek: 'half', half: 'full', full: 'peek' };

type Props = {
  h: number;
  bottom: number;
  snap: Snap;
  onSnap: (s: Snap) => void;
  title: string;
  right?: string;
  /** Floats 12 pt above the sheet edge and moves with it (Locate me, zoom chip). */
  above?: React.ReactNode;
  children: React.ReactNode;
};

// S-10 grid sheet over the map (F-04 R-04.14, design-system.md › Explore grid sheet).
export function GridSheet({ h, bottom, snap, onSnap, title, right, above, children }: Props) {
  const [y] = useState(() => new Animated.Value(h - snapHeight(snap, h, bottom)));
  const live = useRef({ h, bottom, snap, onSnap, start: 0, reduce: false });
  useEffect(() => {
    Object.assign(live.current, { h, bottom, snap, onSnap });
  }, [h, bottom, snap, onSnap]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((r) => (live.current.reduce = r))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const to = h - snapHeight(snap, h, bottom);
    if (live.current.reduce) y.setValue(to);
    else spring(y, to);
  }, [snap, h, bottom, y]);

  // Handlers read `live` only during gestures, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        y.stopAnimation((v) => (live.current.start = v));
      },
      onPanResponderMove: (_e, g) => {
        const L = live.current;
        const min = L.h - snapHeight('full', L.h, L.bottom);
        const max = L.h - snapHeight('peek', L.h, L.bottom);
        y.setValue(Math.min(max, Math.max(min, L.start + g.dy)));
      },
      onPanResponderRelease: (_e, g) => {
        const L = live.current;
        const visible = L.h - Math.min(L.h, Math.max(0, L.start + g.dy));
        const next = snapAfterDrag(visible, g.vy, L.h, L.bottom, L.snap);
        if (next === L.snap) spring(y, L.h - snapHeight(next, L.h, L.bottom));
        L.onSnap(next);
      },
    }),
  );

  return (
    <Animated.View
      testID="grid-sheet"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: h,
        transform: [{ translateY: y }],
        backgroundColor: color.bgBase,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        shadowColor: 'black',
        shadowOpacity: 0.45,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -8 },
        elevation: 12,
      }}
    >
      {above ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 12, minHeight: 44, paddingHorizontal: space.l, flexDirection: 'row', alignItems: 'center' }}>
          {above}
        </View>
      ) : null}
      <View {...pan.panHandlers}>
        <Pressable
          testID="sheet-handle"
          accessibilityRole="adjustable"
          accessibilityLabel={tx.explore.sheet}
          accessibilityValue={{ text: snap }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const i = SNAPS.indexOf(snap);
            onSnap(SNAPS[e.nativeEvent.actionName === 'increment' ? Math.min(2, i + 1) : Math.max(0, i - 1)]);
          }}
          onPress={() => onSnap(NEXT[snap])}
          style={{ height: 28, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ width: 40, height: 5, borderRadius: radius.pill, backgroundColor: color.line }} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: space.l, paddingBottom: space.m, gap: space.s }}>
          <Text accessibilityRole="header" style={{ ...type.title, color: color.fgPrimary, flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
          {right ? <Text style={{ ...type.meta, color: color.fgSecondary }}>{right}</Text> : null}
        </View>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}
