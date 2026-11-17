import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { MyProfile, NowStatus, Settings } from './types';

// Web build is served by the API host (DEV: https://localhost:7443), so same-origin by default.
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '') + '/v1';

const K = { access: 'thirstr.access', refresh: 'thirstr.refresh', install: 'thirstr.install' };

// Tokens live in Keychain/Keystore on native; web (DEV tool only) falls back to AsyncStorage.
const native = Platform.OS === 'ios' || Platform.OS === 'android';
const secure = {
  get: (k: string) => (native ? SecureStore.getItemAsync(k) : AsyncStorage.getItem(k)),
  set: (k: string, v: string) => (native ? SecureStore.setItemAsync(k, v) : AsyncStorage.setItem(k, v)),
  del: (k: string) => (native ? SecureStore.deleteItemAsync(k) : AsyncStorage.removeItem(k)),
};

export type Me = {
  status: 'active' | 'paused' | 'quarantined' | 'suspended' | 'banned' | 'deleted';
  verified: boolean;
  verified_since?: string | null;
  onboarding_step: 'basics' | 'location' | 'photo' | 'verify' | 'done';
  safe_mode: 'auto' | 'on' | 'off' | string;
  safe_mode_active?: boolean;
  incognito?: boolean;
  hidden?: boolean;
  member_since?: string;
  profile: null | MyProfile;
  profiles?: MyProfile[];
  location: null | {
    level: 'hidden' | 'city' | 'area' | 'exact' | null;
    pin?: null | { lat: number; lng: number; audience: string; expires_at: string };
    hide_from_hidden?: boolean;
  };
  now?: NowStatus | null;
  settings?: Settings;
};

export type Photo = { id: string; slot: number; status: string; reject_reason: string | null; url: string | null; main_ok?: boolean };
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
  await secure.set(K.access, s.access_token);
  await secure.set(K.refresh, s.refresh_token);
  return s.account;
}

export async function clearSession() {
  await secure.del(K.access);
  await secure.del(K.refresh);
}

export async function hasSession() {
  return (await secure.get(K.refresh)) !== null;
}

async function refresh(): Promise<boolean> {
  const token = await secure.get(K.refresh);
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
  const access = await secure.get(K.access);
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

export const API_BASE = BASE;

/** Uploads a picked image to a presigned URL (public photos; EXIF stripped by the picker re-encode). */
export async function putBlob(url: string, uri: string, contentType: string) {
  const blob = await (await fetch(uri)).blob();
  const res = await fetch(url, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
  if (!res.ok) throw new ApiError(res.status, 'upload_failed', 'Upload failed');
}

/** Current access token (realtime socket auth). Call any `api()` first to refresh an expired one. */
export const accessToken = () => secure.get(K.access);
