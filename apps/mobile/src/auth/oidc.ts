import { api, platform, saveSession, Session } from '../api/client';

// Sign in with Apple / Google. Native SDK flows (I-03) hand us an ID token; on DEV the
// server's dev issuer mints one so the full server path is exercised on localhost.
export async function signInWith(provider: 'apple' | 'google', ageConfirmed: boolean) {
  const sub = await devSubject(provider);
  const { id_token } = await api<{ id_token: string }>('POST', '/dev/oidc/token', { sub });
  const s = await api<Session>('POST', '/auth/oidc', { provider, id_token, age_confirmed: ageConfirmed, platform });
  return saveSession(s);
}

// Stable per-install fake subject so "sign in again" finds the same DEV account.
async function devSubject(provider: string) {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const key = 'thirstr.dev.oidc.' + provider;
  let sub = await AsyncStorage.getItem(key);
  if (!sub) {
    sub = provider + '-dev-' + Math.random().toString(36).slice(2, 10);
    await AsyncStorage.setItem(key, sub);
  }
  return sub;
}

export async function requestEmailLink(email: string, ageConfirmed: boolean) {
  await api('POST', '/auth/email/link', { email, age_confirmed: ageConfirmed });
}

export async function verifyEmailToken(token: string) {
  const s = await api<Session>('POST', '/auth/email/verify', { token, platform });
  return saveSession(s);
}
