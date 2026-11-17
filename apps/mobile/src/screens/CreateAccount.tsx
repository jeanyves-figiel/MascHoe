import React, { useState } from 'react';
import { View } from 'react-native';
import { ApiError, Me } from '../api/client';
import { signInWith, requestEmailLink } from '../auth/oidc';
import { loginPasskey, passkeysAvailable, registerPasskey } from '../auth/passkey';
import { t } from '../i18n/strings';
import { space } from '../theme/tokens';
import { Body, Button, Check, ErrorText, Field, H1, Screen } from '../ui';

// S-02 (F-01 R-01.1, R-01.12): passkey first, Apple/Google/email secondary, 18+ checkbox.
export function CreateAccountScreen({ mode, onDone, onEmailSent, onUnderage }: { mode: 'signup' | 'login'; onDone: (me: Me) => void; onEmailSent: () => void; onUnderage: () => void }) {
  const [adult, setAdult] = useState(mode === 'login');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);

  async function run(key: string, fn: () => Promise<Me | void>) {
    if (!adult) return setErr(t.create.adultRequired);
    setErr(null);
    setBusy(key);
    try {
      const me = await fn();
      if (me) onDone(me);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'underage') return onUnderage();
      if (e instanceof ApiError && e.code === 'validation' && e.fields?.age_confirmed) return setErr(t.create.adultRequired);
      if ((e as Error).name === 'NotAllowedError' || (e as Error).message === 'cancelled') return; // passkey sheet cancelled: stay
      setErr(e instanceof ApiError ? e.message : t.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen progress={mode === 'signup' ? 1 : undefined}>
      <H1>{mode === 'signup' ? t.create.title : t.welcome.login}</H1>
      <Body muted>{t.create.noPhone}</Body>
      {mode === 'signup' ? <Check label={t.create.adult} on={adult} onPress={() => setAdult(!adult)} /> : null}
      <View style={{ gap: space.m }}>
        {passkeysAvailable() ? (
          <Button testID="passkey" title={t.create.passkey} busy={busy === 'pk'} onPress={() => run('pk', () => (mode === 'signup' ? registerPasskey(adult) : loginPasskey()))} />
        ) : null}
        <Button title={t.create.apple} kind="secondary" busy={busy === 'apple'} onPress={() => run('apple', () => signInWith('apple', adult))} />
        <Button title={t.create.google} kind="secondary" busy={busy === 'google'} onPress={() => run('google', () => signInWith('google', adult))} />
        {showEmail ? (
          <View style={{ gap: space.s }}>
            <Field label="Email" placeholder={t.create.emailPlaceholder} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Button title={t.create.sendLink} busy={busy === 'email'} disabled={!email.includes('@')} onPress={() => run('email', async () => { await requestEmailLink(email, adult); onEmailSent(); })} />
          </View>
        ) : (
          <Button title={t.create.email} kind="ghost" onPress={() => setShowEmail(true)} />
        )}
      </View>
      <ErrorText text={err} />
    </Screen>
  );
}

export function CheckInboxScreen({ onBack }: { onBack: () => void }) {
  return (
    <Screen progress={1}>
      <H1>{t.inbox.title}</H1>
      <Body muted>{t.inbox.body}</Body>
      {__DEV__ || process.env.EXPO_PUBLIC_ENV === 'dev' ? <Body muted>{t.inbox.devHint}</Body> : null}
      <Button title={t.inbox.back} kind="ghost" onPress={onBack} />
    </Screen>
  );
}
