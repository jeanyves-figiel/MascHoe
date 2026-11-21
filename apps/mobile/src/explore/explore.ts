import { api } from '../api/client';
import type { Card, ExploreSummary, Grid, MapData, Mode, Place } from '../api/types';

export type Filters = {
  age_min?: number;
  age_max?: number;
  distance_max?: number;
  verified_only: boolean;
  online_now: boolean;
  has_now: boolean;
  hide_creators: boolean;
  new_members: boolean;
  [k: string]: unknown;
};

export const defaultFilters: Filters = { verified_only: true, online_now: false, has_now: false, hide_creators: true, new_members: false };

/** Filters no longer offered (#106: languages; chats translate instead). Dropped from saved filters. */
const RETIRED = ['languages'];

/** Saved filters (AsyncStorage) on top of the defaults, without retired keys. */
export function restoreFilters(saved: string | null): Filters {
  const f: Filters = { ...defaultFilters, ...(saved ? (JSON.parse(saved) as Partial<Filters>) : {}) };
  for (const k of RETIRED) delete f[k];
  return f;
}

/** R-04.18 (#113): the chips go as `intents`; `mode` (first chip) keeps older servers working. */
export function query(intents: Mode[], f: Filters, extra: Record<string, string> = {}): string {
  const p: string[] = ['mode=' + intents[0], 'intents=' + intents.join(',')];
  for (const [k, v] of Object.entries({ ...f, ...extra })) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) p.push(`${k}=${encodeURIComponent(v.join(','))}`);
    } else p.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  return p.join('&');
}

export const loadGrid = (i: Mode[], f: Filters, cursor?: string | null) => api<Grid>('GET', '/explore/grid?' + query(i, f, cursor ? { cursor } : {}));
export const loadTray = (i: Mode[], f: Filters) => api<{ items: Card[] }>('GET', '/explore/tray?' + query(i, f));
const bboxParam = (b: [number, number, number, number]) => b.map((n) => n.toFixed(5)).join(',');
export const loadMap = (i: Mode[], f: Filters, bbox: [number, number, number, number]) => api<MapData>('GET', '/explore/map?' + query(i, f, { bbox: bboxParam(bbox) }));
export const loadSummary = (i: Mode[], f: Filters) => api<ExploreSummary>('GET', '/explore/summary?' + query(i, f));
/** R-04.20: only the viewport goes out, to our own API (never a third-party place service). */
export const loadPlaces = (kinds: string[], bbox: [number, number, number, number]) =>
  kinds.length ? api<{ places: Place[] }>('GET', `/places?bbox=${bboxParam(bbox)}&kinds=${kinds.join(',')}`) : Promise.resolve({ places: [] as Place[] });

/** R-04.18: filters panel for the chips: a single chip shows its own groups; several show the shared ones. */
export const filterMode = (i: Mode[]): Mode => (i.length === 1 ? i[0] : 'friends');

/** R-04.17: number of filters that differ from the defaults (badge on the Filters button). */
export function activeFilterCount(f: Filters): number {
  let n = 0;
  for (const [k, v] of Object.entries(f)) {
    const d = (defaultFilters as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === 'boolean' ? v !== (d ?? false) : true) n++;
  }
  return n;
}

/** R-04.17: header counts, exact up to 99 then "99+"; unknown → "·". */
export const countLabel = (n: number | null | undefined) => (n == null ? '·' : n > 99 ? '99+' : String(n));
