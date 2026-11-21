// F-19 G10 (#187): profiles seen while swiping through the grid. The neighbours of the open profile are
// fetched ahead (data + first photo), so a swipe lands on a ready profile with no spinner. Memory only,
// capped, gone after an app restart. Profiles that answer 404/403 are skipped by the swipe.
import { Image } from 'react-native';
import { api, ApiError } from '../api/client';
import type { Mode, ProfileView } from '../api/types';

const MAX = 24;
const cache = new Map<string, ProfileView>();
const inflight = new Map<string, Promise<ProfileView | null>>();
const dead = new Set<string>();

export const profileKey = (id: string, mode: Mode, trip?: string) => `${id}|${mode}|${trip ?? ''}`;
const url = (id: string, mode: Mode, trip?: string) => `/profiles/${id}?mode=${mode}${trip ? `&trip_id=${trip}` : ''}`;

export function cachedProfile(id: string, mode: Mode, trip?: string): ProfileView | undefined {
  return cache.get(profileKey(id, mode, trip));
}

export function putProfile(v: ProfileView, mode: Mode, trip?: string) {
  const k = profileKey(v.id, mode, trip);
  cache.delete(k);
  cache.set(k, v);
  while (cache.size > MAX) cache.delete(cache.keys().next().value as string);
}

export const isDead = (id: string) => dead.has(id);
export const markDead = (id: string) => dead.add(id);

/** Loads a profile into the cache (shared in-flight request). Null = not available (404 / 403). */
export function fetchProfile(id: string, mode: Mode, trip?: string): Promise<ProfileView | null> {
  const k = profileKey(id, mode, trip);
  const run = inflight.get(k);
  if (run) return run;
  const p = api<ProfileView>('GET', url(id, mode, trip))
    .then(
      (v) => {
        putProfile(v, mode, trip);
        dead.delete(id);
        return v;
      },
      (e) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
          dead.add(id);
          return null;
        }
        throw e;
      },
    )
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** Fetch ahead: data and first photo of a neighbour. Errors are ignored (the swipe retries on arrival). */
export function warmProfile(id: string, mode: Mode, trip?: string): Promise<ProfileView | null> {
  const have = cachedProfile(id, mode, trip);
  const p = have ? Promise.resolve(have) : fetchProfile(id, mode, trip);
  return p.then(
    (v) => {
      const first = v?.photos[0];
      if (first) Image.prefetch(first).catch(() => {});
      return v;
    },
    () => null,
  );
}

/** Next index in `ids` from `at` in direction `d`, skipping profiles known to be unavailable. −1 = none. */
export function stepIndex(ids: string[], at: number, d: -1 | 1, skip: (id: string) => boolean = isDead): number {
  for (let k = at + d; k >= 0 && k < ids.length; k += d) if (!skip(ids[k])) return k;
  return -1;
}

export function _resetProfileCache() {
  cache.clear();
  inflight.clear();
  dead.clear();
}
