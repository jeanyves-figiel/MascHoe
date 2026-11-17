import React, { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError, Me } from '../api/client';
import { t } from '../i18n/strings';
import { BasicsInput, basicsValid } from '../onboarding/flow';
import { Button, Chip, ErrorText, Field, H1, Label, Screen, s } from '../ui';

// S-03 (R-02.4, R-02.5). Birthday as YYYY-MM-DD on web; native gets the OS date wheel.
export function BasicsScreen({ me, onDone, onUnderage }: { me: Me; onDone: (me: Me) => void; onUnderage: () => void }) {
  const [b, setB] = useState<BasicsInput>({
    display_name: me.profile?.display_name ?? '',
    birthdate: '',
    gender: me.profile?.gender ?? '',
    gender_other: me.profile?.gender_other ?? '',
    here_for: me.profile?.here_for ?? ['hookup', 'tonight'],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const set = (k: keyof BasicsInput, v: any) => setB({ ...b, [k]: v });
  const toggle = (h: string) => set('here_for', b.here_for.includes(h) ? b.here_for.filter((x) => x !== h) : [...b.here_for, h]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      onDone(await api<Me>('PUT', '/me/basics', b));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'underage') return onUnderage();
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setErr(e instanceof ApiError ? e.message : t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen progress={2}>
      <H1>{t.basics.title}</H1>
      <Field label={t.basics.name} placeholder={t.basics.namePh} value={b.display_name} maxLength={30} onChangeText={(v) => set('display_name', v)} error={fields.display_name?.[0]} />
      <Field label={t.basics.birthday} placeholder="YYYY-MM-DD" value={b.birthdate} onChangeText={(v) => set('birthdate', v)} inputMode="numeric" error={fields.birthdate?.[0] ?? undefined} />
      <Label>{t.basics.iam}</Label>
      <View style={s.chips}>
        {Object.entries(t.basics.genders).map(([k, label]) => (
          <Chip key={k} label={label} on={b.gender === k} onPress={() => set('gender', k)} />
        ))}
      </View>
      {b.gender === 'other' ? <Field label={t.basics.genders.other} placeholder={t.basics.otherPh} maxLength={20} value={b.gender_other} onChangeText={(v) => set('gender_other', v)} error={fields.gender_other?.[0]} /> : null}
      <Label>{t.basics.herefor}</Label>
      <View style={s.chips}>
        {Object.entries(t.basics.hereFor).map(([k, label]) => (
          <Chip key={k} label={label} on={b.here_for.includes(k)} onPress={() => toggle(k)} />
        ))}
      </View>
      <View style={s.spacer} />
      <ErrorText text={err} />
      <Button testID="basics-continue" title={t.basics.continue} disabled={!basicsValid(b)} busy={busy} onPress={submit} />
    </Screen>
  );
}

export function UnderageScreen() {
  return (
    <Screen>
      <H1>{t.underage.title}</H1>
      <Label>{t.underage.body}</Label>
    </Screen>
  );
}
