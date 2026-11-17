import * as ExpoLocation from 'expo-location';
import { api, Me } from '../api/client';
import { areaCell } from '../geo/cells';

// R-05.8: update on significant move (> 100 m) or every 5 min in foreground; rate limit 1/30 s.
// Only the r9 cell leaves the device (R-05.1); Exact pins are set explicitly in the Location sheet.
let last: { lat: number; lng: number; at: number; cell: string } | null = null;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  const perm = await ExpoLocation.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') return null;
  const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/** Sends the current r9 cell if needed. Returns updated Me, or null when nothing was sent. */
export async function syncLocation(me: Me, force = false): Promise<Me | null> {
  const level = me.location?.level;
  if (level !== 'area' && level !== 'exact' && level !== 'hidden') return null;
  const pos = await currentPosition().catch(() => null);
  if (!pos) return null;
  const now = Date.now();
  if (!force && last && now - last.at < 30_000) return null;
  if (!force && last && metres(last, pos) < 100 && now - last.at < 5 * 60_000) return null;
  const cell = areaCell(pos.lat, pos.lng);
  last = { ...pos, at: now, cell };
  const body = level === 'hidden' ? { level: 'hidden', cell_r9: cell } : { level: level === 'exact' ? 'exact' : 'area', cell_r9: cell };
  return api<Me>('PUT', '/me/location', body);
}

export function lastKnown() {
  return last;
}
