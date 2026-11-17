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
};
