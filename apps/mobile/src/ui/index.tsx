import React, { createContext, useContext } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { color, Mode, modeColor, radius, space, tileFor, touch, type } from '../theme/tokens';
import { Icon } from './icons';
export { Icon } from './icons';

// Current mode recolours accent surfaces (R-04.1, design-system.md › Pop).
export const ModeContext = createContext<Mode>('hookup');
export const useAccent = () => modeColor[useContext(ModeContext)];

export function Screen({ children, progress, padded = true }: { children: React.ReactNode; progress?: number; padded?: boolean }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, !padded && { padding: 0 }]} keyboardShouldPersistTaps="handled">
      {progress ? <Progress step={progress} /> : null}
      {children}
    </ScrollView>
  );
}

export function Progress({ step, total = 5 }: { step: number; total?: number }) {
  const accent = useAccent();
  return (
    <View style={s.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.seg, i < step && { backgroundColor: accent }]} />
      ))}
    </View>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return (
    <Text style={s.display} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={[s.title, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[s.body, muted && s.muted, style]}>{children}</Text>;
}

export function Meta({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.meta, style]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

type BtnProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'trust';
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  small?: boolean;
  fill?: string;
};

export function Button({ title, onPress, kind = 'primary', disabled, busy, testID, small, fill }: BtnProps) {
  const accent = useAccent();
  const off = disabled || busy;
  const bg = fill ?? (kind === 'primary' ? accent : kind === 'trust' ? color.trust : undefined);
  const onFill = !!bg;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, small && s.btnSmall, s[kind === 'trust' ? 'primary' : kind], bg ? { backgroundColor: bg } : null, off && s.off, pressed && !off && s.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={onFill ? color.onAccent : color.fgPrimary} />
      ) : (
        <Text style={[s.btnText, small && s.btnTextSmall, onFill && s.btnTextOnFill, kind === 'danger' && s.btnTextDanger]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, disabled, fill }: { label: string; on: boolean; onPress: () => void; disabled?: boolean; fill?: string }) {
  const ctx = useAccent();
  const accent = fill ?? ctx;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      onPress={disabled ? undefined : onPress}
      style={[s.chip, on && { backgroundColor: accent, borderColor: accent }, disabled && s.off]}
    >
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: React.ReactNode }) {
  return <View style={s.chips}>{children}</View>;
}

/** Segmented pill (Map/Grid, mode switch). `fills` gives each selected segment its own colour. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  fills,
  label,
  grow,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  fills?: Partial<Record<T, string>>;
  label: string;
  grow?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.segmented, grow && { flex: 1 }]}>
      {options.map((o) => {
        const on = o.value === value;
        const bg = on ? (fills?.[o.value] ?? color.bgInverse) : 'transparent';
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[s.segBtn, grow && { flex: 1 }, { backgroundColor: bg }]}
          >
            <Text style={[s.segText, on && { color: color.onAccent }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field(props: TextInputProps & { label: string; error?: string; hint?: string }) {
  const { label, error, hint, ...rest } = props;
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor={color.fgMuted} style={[s.input, rest.multiline && s.inputMulti, error ? s.inputErr : null]} accessibilityLabel={label} {...rest} />
      {error ? <Text style={s.err}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Check({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const accent = useAccent();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={s.checkRow}>
      <View style={[s.box, on && { backgroundColor: accent, borderColor: accent }]}>{on ? <Text style={s.tick}>✓</Text> : null}</View>
      <Text style={[s.body, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

export function Toggle({ label, sub, value, onChange, disabled, tone }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; tone?: string }) {
  return (
    <View style={[s.row, disabled && s.off]}>
      <View style={{ flex: 1 }}>
        <Text style={s.body}>{label}</Text>
        {sub ? <Text style={s.meta}>{sub}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: tone ?? color.trust, false: color.line }}
        thumbColor={color.bgInverse}
      />
    </View>
  );
}

export function ListRow({ title, sub, onPress, right, danger, testID }: { title: string; sub?: string; onPress?: () => void; right?: string; danger?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.row, pressed && s.pressed]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.body, danger && { color: color.danger }]}>{title}</Text>
        {sub ? <Text style={s.meta}>{sub}</Text> : null}
      </View>
      {right ? <Text style={s.meta}>{right}</Text> : null}
      {onPress ? <Text style={[s.meta, { marginLeft: space.s }]}>›</Text> : null}
    </Pressable>
  );
}

export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      <View style={s.card}>{children}</View>
    </View>
  );
}

export function Banner({ text, tone = 'trust', onPress, testID }: { text: string; tone?: 'trust' | 'danger' | 'warn' | 'personal'; onPress?: () => void; testID?: string }) {
  const c = tone === 'warn' ? color.personal : color[tone];
  return (
    <Pressable testID={testID} onPress={onPress} style={[s.banner, { borderColor: c }]} accessibilityRole={onPress ? 'button' : 'alert'}>
      <Text style={[s.meta, { color: c }]}>{text}</Text>
    </Pressable>
  );
}

export function Badge({ label, fill, small }: { label: string; fill: string; small?: boolean }) {
  return (
    <View style={[s.badge, { backgroundColor: fill }, small && { paddingHorizontal: space.s, paddingVertical: 2 }]} accessibilityLabel={label}>
      <Text style={s.badgeText}>{label}</Text>
    </View>
  );
}

export function VerifiedTick({ size = 14 }: { size?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Verified" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.trust, alignItems: 'center', justifyContent: 'center' }}>
      <Icon.Check size={size * 0.62} w={3.6} />
    </View>
  );
}

export function ErrorText({ text }: { text: string | null }) {
  return text ? (
    <Text style={s.err} accessibilityRole="alert">
      {text}
    </Text>
  ) : null;
}

export function EmptyState({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.empty}>
      <Text style={s.title}>{title}</Text>
      {body ? <Text style={[s.body, s.muted, { textAlign: 'center' }]}>{body}</Text> : null}
      {action && onAction ? <Button title={action} onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({ text, onRetry, retry }: { text: string; onRetry: () => void; retry: string }) {
  return (
    <View style={s.empty}>
      <Text style={[s.body, s.muted, { textAlign: 'center' }]}>{text}</Text>
      <Button title={retry} kind="secondary" onPress={onRetry} />
    </View>
  );
}

export function Loading() {
  const accent = useAccent();
  return <ActivityIndicator style={{ flex: 1, padding: space.xxl }} color={accent} />;
}

/** Photo with placeholder tone (tile.*) until loaded or when there is none. */
export function Photo({ uri, id, style, label }: { uri: string | null | undefined; id: string; style: ViewStyle; label: string }) {
  return (
    <View style={[{ backgroundColor: tileFor(id), overflow: 'hidden' }, style]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} accessibilityLabel={label} resizeMode="cover" /> : null}
    </View>
  );
}

/** Bottom scrim over photos (App v2): stepped ink bands, transparent → ~90 %, no gradient dependency. */
export function Scrim({ height = '60%', max = 0.9, steps = 10 }: { height?: ViewStyle['height']; max?: number; steps?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      {Array.from({ length: steps }, (_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: color.bgBase, opacity: (max * (i + 1)) / steps }} />
      ))}
    </View>
  );
}

/** Bottom sheet (S-12, S-30, …). */
export function Sheet({ visible, onClose, title, children, closeLabel = 'Close' }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; closeLabel?: string }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel={closeLabel} />
      <View style={s.sheet} accessibilityViewIsModal>
        <View style={s.sheetHead}>
          <Text style={s.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} style={s.close}>
            <Icon.Close />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: space.l, paddingBottom: space.huge }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function Wordmark({ size = 27 }: { size?: number }) {
  const dot = size * 0.3;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }} accessibilityRole="header" accessibilityLabel="Thirstr">
      <Text style={{ ...type.display, fontSize: size, lineHeight: size * 1.2, letterSpacing: -size * 0.04, color: color.fgPrimary }}>
        thirst<Text style={{ color: color.hookup }}>r</Text>
      </Text>
      {[color.personal, color.friends, color.sport].map((c) => (
        <View key={c} style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c, marginLeft: size * 0.08 }} />
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bgBase },
  content: { padding: space.l, paddingTop: space.xxxl + space.xl, gap: space.l, maxWidth: 560, width: '100%', alignSelf: 'center', flexGrow: 1, paddingBottom: 120 },
  progress: { flexDirection: 'row', gap: space.xs },
  seg: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: color.line },
  display: { ...type.display, color: color.fgPrimary },
  title: { ...type.title, color: color.fgPrimary },
  headline: { ...type.headline, color: color.fgPrimary },
  body: { ...type.body, color: color.fgPrimary },
  meta: { ...type.meta, color: color.fgSecondary },
  muted: { color: color.fgSecondary },
  label: { ...type.meta, color: color.fgSecondary, marginBottom: space.xs },
  sectionTitle: { ...type.caption, color: color.fgSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: space.xs },
  hint: { ...type.meta, color: color.fgMuted },
  btn: { minHeight: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  btnSmall: { minHeight: touch, paddingHorizontal: space.l },
  primary: {},
  trust: {},
  secondary: { backgroundColor: color.bgRaised, borderWidth: 1, borderColor: color.line },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.danger },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  btnText: { ...type.headline, fontSize: 17, color: color.fgPrimary },
  btnTextSmall: { ...type.meta, fontFamily: type.headline.fontFamily },
  btnTextOnFill: { color: color.onAccent },
  btnTextDanger: { color: color.danger },
  chip: { minHeight: touch - 6, paddingHorizontal: space.m, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, justifyContent: 'center', backgroundColor: color.bgRaised },
  chipText: { ...type.meta, color: color.fgPrimary },
  chipTextOn: { color: color.onAccent, fontFamily: type.headline.fontFamily },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  segmented: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: radius.pill, backgroundColor: color.bgRaised },
  segBtn: { minHeight: 38, paddingHorizontal: space.m, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segText: { ...type.meta, fontFamily: type.headline.fontFamily, color: color.fgPrimary },
  field: { gap: space.xxs },
  input: { ...type.body, minHeight: touch + 4, color: color.fgPrimary, backgroundColor: color.bgRaised, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.l },
  inputMulti: { minHeight: 96, paddingTop: space.m, textAlignVertical: 'top' },
  inputErr: { borderColor: color.danger },
  err: { ...type.meta, color: color.danger },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: touch },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: color.fgSecondary, alignItems: 'center', justifyContent: 'center' },
  tick: { color: color.onAccent, fontFamily: type.headline.fontFamily },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: touch + 8, paddingVertical: space.s, paddingHorizontal: space.l },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.m, backgroundColor: color.bgRaised },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.m, paddingVertical: space.xs, alignSelf: 'flex-start' },
  badgeText: { ...type.caption, color: color.onAccent },
  card: { backgroundColor: color.bgRaised, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, overflow: 'hidden' },
  spacer: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: space.l, padding: space.xxl, flexGrow: 1 },
  scrim: { flex: 1, backgroundColor: color.scrim },
  sheet: { maxHeight: '88%', backgroundColor: color.bgBase, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.l, paddingTop: space.l },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.m },
  close: { marginLeft: 'auto', width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
});
