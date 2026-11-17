import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Web build is served by the API host (DEV: https://localhost:7443), so same-origin by default.
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '') + '/v1';

// TODO(native): move tokens to Keychain/Keystore (expo-secure-store) before native beta builds.
const K = { access: 'thirstr.access', refresh: 'thirstr.refresh', install: 'thirstr.install' };

export type Me = {
  status: 'active' | 'paused' | 'quarantined' | 'banned' | 'deleted';
  verified: boolean;
  onboarding_step: 'basics' | 'location' | 'photo' | 'verify' | 'done';
  safe_mode: string;
  profile: null | {
    id: string;
    display_name: string;
    age: number;
    gender: string;
    gender_other: string | null;
    here_for: string[];
    photos: Photo[];
  };
  location: null | { level: 'city' | 'area' | 'exact' | null };
};

export type Photo = { id: string; slot: number; status: string; reject_reason: string | null; url: string | null };
export type Session = { access_token: string; refresh_token: string; expires_in: number; account: Me };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function installId(): Promise<string> {
  let id = await AsyncStorage.getItem(K.install);
  if (!id) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await AsyncStorage.setItem(K.install, id);
  }
  return id;
}

export async function saveSession(s: Session) {
  await AsyncStorage.multiSet([
    [K.access, s.access_token],
    [K.refresh, s.refresh_token],
  ]);
  return s.account;
}

export async function clearSession() {
  await AsyncStorage.multiRemove([K.access, K.refresh]);
}

export async function hasSession() {
  return (await AsyncStorage.getItem(K.refresh)) !== null;
}

async function refresh(): Promise<boolean> {
  const token = await AsyncStorage.getItem(K.refresh);
  if (!token) return false;
  const res = await fetch(BASE + '/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh: token }),
  });
  if (!res.ok) {
    await clearSession();
    return false;
  }
  await saveSession(await res.json());
  return true;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-thirstr-install': await installId(),
    'x-thirstr-platform': Platform.OS,
  };
  const access = await AsyncStorage.getItem(K.access);
  if (access) headers.authorization = 'Bearer ' + access;

  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && retry && access && (await refresh())) return api<T>(method, path, body, false);
  if (res.status === 202 || res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error ?? {};
    throw new ApiError(res.status, e.code ?? 'internal', e.message ?? 'Something went wrong', e.fields);
  }
  return json as T;
}

export const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
