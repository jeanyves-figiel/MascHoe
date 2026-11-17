import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { color, radius, space, touch, type } from '../theme/tokens';

export function Screen({ children, progress }: { children: React.ReactNode; progress?: number }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {progress ? <Progress step={progress} /> : null}
      {children}
    </ScrollView>
  );
}

export function Progress({ step, total = 5 }: { step: number; total?: number }) {
  return (
    <View style={s.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.seg, i < step && s.segOn]} />
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

export function Body({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[s.body, muted && s.muted, style]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

type BtnProps = { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; busy?: boolean; testID?: string };

export function Button({ title, onPress, kind = 'primary', disabled, busy, testID }: BtnProps) {
  const off = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, s[kind], off && s.off, pressed && !off && s.pressed]}
    >
      {busy ? <ActivityIndicator color={kind === 'primary' ? color.onAccent : color.fgPrimary} /> : <Text style={[s.btnText, kind === 'primary' && s.btnTextPrimary, kind === 'danger' && s.btnTextDanger]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }} onPress={disabled ? undefined : onPress} style={[s.chip, on && s.chipOn, disabled && s.off]}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; error?: string }) {
  const { label, error, ...rest } = props;
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor={color.fgMuted} style={[s.input, error ? s.inputErr : null]} accessibilityLabel={label} {...rest} />
      {error ? <Text style={s.err}>{error}</Text> : null}
    </View>
  );
}

export function Check({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={s.checkRow}>
      <View style={[s.box, on && s.boxOn]}>{on ? <Text style={s.tick}>✓</Text> : null}</View>
      <Text style={s.body}>{label}</Text>
    </Pressable>
  );
}

export function Banner({ text, tone = 'trust' }: { text: string; tone?: 'trust' | 'danger' | 'warn' }) {
  return (
    <View style={[s.banner, { borderColor: color[tone] }]} accessibilityRole="alert">
      <Text style={[s.meta, { color: color[tone] }]}>{text}</Text>
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

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bgBase },
  content: { padding: space.l, paddingTop: space.xxxl, gap: space.l, maxWidth: 480, width: '100%', alignSelf: 'center', flexGrow: 1 },
  progress: { flexDirection: 'row', gap: space.xs },
  seg: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: color.line },
  segOn: { backgroundColor: color.hookup },
  display: { ...type.display, color: color.fgPrimary },
  title: { ...type.title, color: color.fgPrimary },
  body: { ...type.body, color: color.fgPrimary },
  meta: { ...type.meta, color: color.fgSecondary },
  muted: { color: color.fgSecondary },
  label: { ...type.meta, color: color.fgSecondary, marginBottom: space.xs },
  btn: { minHeight: touch + 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  primary: { backgroundColor: color.hookup },
  secondary: { backgroundColor: color.bgRaised, borderWidth: 1, borderColor: color.line },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.danger },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  btnText: { ...type.headline, color: color.fgPrimary },
  btnTextPrimary: { color: color.onAccent },
  btnTextDanger: { color: color.danger },
  chip: { minHeight: touch, paddingHorizontal: space.l, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, justifyContent: 'center', backgroundColor: color.bgRaised },
  chipOn: { borderColor: color.hookup, backgroundColor: color.bgOverlay },
  chipText: { ...type.meta, color: color.fgSecondary },
  chipTextOn: { color: color.hookup },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  field: { gap: space.xxs },
  input: { ...type.body, minHeight: touch + 4, color: color.fgPrimary, backgroundColor: color.bgRaised, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.m },
  inputErr: { borderColor: color.danger },
  err: { ...type.meta, color: color.danger },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: touch },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: color.fgSecondary, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.hookup, borderColor: color.hookup },
  tick: { color: color.onAccent, fontWeight: '700' },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.m, backgroundColor: color.bgRaised },
  card: { backgroundColor: color.bgRaised, borderRadius: radius.lg, padding: space.l, gap: space.s, borderWidth: 1, borderColor: color.line },
  spacer: { flex: 1 },
});
