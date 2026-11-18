import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../theme/tokens';

// App v2 icon set (design-system.md › Iconography): 24 grid, rounded strokes. Decorative: callers label the button.
type P = { size?: number; c?: string; w?: number; fill?: string };
const base = (c: string, w: number) => ({ fill: 'none', stroke: c, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const Icon = {
  Pin: ({ size = 22, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" {...base(c, w)} />
      <Circle cx={12} cy={10} r={2.5} {...base(c, w)} />
    </Svg>
  ),
  Moon: ({ size = 22, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" {...base(c, w)} />
    </Svg>
  ),
  Chat: ({ size = 22, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" {...base(c, w)} />
    </Svg>
  ),
  User: ({ size = 22, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} {...base(c, w)} />
      <Path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" {...base(c, w)} />
    </Svg>
  ),
  Filter: ({ size = 18, c = color.fgPrimary, w = 1.9 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" {...base(c, w)} />
      <Circle cx={16} cy={7} r={2} {...base(c, w)} />
      <Circle cx={10} cy={17} r={2} {...base(c, w)} />
    </Svg>
  ),
  Map: ({ size = 18, c = color.fgPrimary, w = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 4l-6 3v13l6-3 6 3 6-3V4l-6 3z" {...base(c, w)} />
      <Path d="M9 4v13M15 7v13" {...base(c, w)} />
    </Svg>
  ),
  Grid: ({ size = 17, c = color.fgPrimary, w = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {[
        [3, 3],
        [14, 3],
        [3, 14],
        [14, 14],
      ].map(([x, y]) => (
        <Rect key={`${x}${y}`} x={x} y={y} width={7} height={7} rx={2} {...base(c, w)} />
      ))}
    </Svg>
  ),
  Back: ({ size = 22, c = color.fgPrimary, w = 2.3 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 18l-6-6 6-6" {...base(c, w)} />
    </Svg>
  ),
  Next: ({ size = 16, c = color.fgMuted, w = 2.2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" {...base(c, w)} />
    </Svg>
  ),
  More: ({ size = 20, c = color.fgPrimary }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={2} fill={c} />
      <Circle cx={12} cy={12} r={2} fill={c} />
      <Circle cx={19} cy={12} r={2} fill={c} />
    </Svg>
  ),
  Star: ({ size = 24, c = color.fgPrimary, fill = 'none' }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill={fill} stroke={c} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  ),
  Lock: ({ size = 13, c = color.trust, w = 2.2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={11} width={16} height={10} rx={2} {...base(c, w)} />
      <Path d="M8 11V7a4 4 0 018 0v4" {...base(c, w)} />
    </Svg>
  ),
  Plus: ({ size = 20, c = color.fgPrimary, w = 2.3 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" {...base(c, w)} />
    </Svg>
  ),
  Close: ({ size = 20, c = color.fgPrimary, w = 2.3 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" {...base(c, w)} />
    </Svg>
  ),
  Send: ({ size = 20, c = color.onAccent, w = 2.4 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12h14M13 6l6 6-6 6" {...base(c, w)} />
    </Svg>
  ),
  Timer: ({ size = 13, c = color.onAccent, w = 2.4 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={13} r={8} {...base(c, w)} />
      <Path d="M12 9v4l2 2M10 2h4" {...base(c, w)} />
    </Svg>
  ),
  Check: ({ size = 14, c = color.onAccent, w = 3.2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12l5 5 9-10" {...base(c, w)} />
    </Svg>
  ),
  Share: ({ size = 20, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" {...base(c, w)} />
    </Svg>
  ),
  EyeOff: ({ size = 20, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 9.5 7 9.5 7a17 17 0 01-3.2 4.1M6.3 6.4C3.9 8 2.5 12 2.5 12S6 19 12 19a9.6 9.6 0 004.3-1" {...base(c, w)} />
      <Path d="M9.9 9.9a3 3 0 004.2 4.2" {...base(c, w)} />
    </Svg>
  ),
  Flag: ({ size = 20, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 21V4M5 4h11l-2 4 2 4H5" {...base(c, w)} />
    </Svg>
  ),
  Ban: ({ size = 20, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...base(c, w)} />
      <Path d="M5.6 5.6l12.8 12.8" {...base(c, w)} />
    </Svg>
  ),
  Shield: ({ size = 20, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" {...base(c, w)} />
      <Path d="M8.5 12l2.5 2.5 4.5-5" {...base(c, w)} />
    </Svg>
  ),
  Bolt: ({ size = 22, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2L4 14h7l-1 8 9-12h-7z" {...base(c, w)} />
    </Svg>
  ),
  Home: ({ size = 22, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 11l9-7 9 7M5 9.5V20h14V9.5" {...base(c, w)} />
      <Path d="M10 20v-5h4v5" {...base(c, w)} />
    </Svg>
  ),
  Car: ({ size = 22, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM5 11h14" {...base(c, w)} />
      <Circle cx={7.5} cy={16} r={0.6} {...base(c, w)} />
      <Circle cx={16.5} cy={16} r={0.6} {...base(c, w)} />
    </Svg>
  ),
  Door: ({ size = 22, c = color.fgPrimary, w = 2.1 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 21h16M6 21V4l10-1v18M13 12v.5" {...base(c, w)} />
    </Svg>
  ),
};
