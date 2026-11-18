import { cellToBoundary, cellToLatLng } from 'h3-js';
import { API_BASE } from '../api/client';
import type { Card, MapData } from '../api/types';

// Tiles + style come through our API (/v1/tiles), never a third-party host (I-03).
export const STYLE_URL = API_BASE + '/tiles/style.json';

export type MapProps = {
  /** Where to centre (R-04.13); zoom defaults to START_ZOOM. */
  center: { lat: number; lng: number; zoom?: number } | null;
  me: { lat: number; lng: number } | null;
  /** Bump to recentre on `center` (Locate me). */
  recenter: number;
  data: MapData | null;
  accent: string;
  onRegion: (bbox: [number, number, number, number]) => void;
  /** Tap on a pin: the screen selects it, or opens the profile when already selected (R-04.14). */
  onSelect: (card: Card) => void;
  /** Tap on the map away from pins: clears the selection. */
  onClear?: () => void;
  /** Selected pin (grown, name chip). */
  selected?: string | null;
};

/** Cell heat polygons (R-04.2 a). Opacity grows with count, capped. */
export function cellsGeoJSON(data: MapData | null): GeoJSON.FeatureCollection {
  const max = Math.max(1, ...(data?.cells ?? []).map((c) => c.count));
  return {
    type: 'FeatureCollection',
    features: (data?.cells ?? []).map((c) => ({
      type: 'Feature',
      properties: { w: 0.08 + 0.32 * (c.count / max) },
      geometry: { type: 'Polygon', coordinates: [cellToBoundary(c.cell, true)] },
    })),
  };
}

/** Start zoom: a few r7 cells fit on screen, so heat reads as areas, not one blob. */
export const START_ZOOM = 12;

/** Count labels at cell centres (max 40), shown where the server gives counts, not people. */
export function cellLabels(data: MapData | null): { key: string; lat: number; lng: number; label: string }[] {
  return (data?.cells ?? [])
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 40)
    .map((c) => {
      const [lat, lng] = cellToLatLng(c.cell);
      return { key: c.cell, lat, lng, label: c.count > 999 ? `${Math.floor(c.count / 1000)}k+` : String(c.count) };
    });
}

export function initial(name: string) {
  return (name.trim()[0] ?? '?').toUpperCase();
}

/** MapLibre metres per pixel at zoom 0 on the equator (512 px tiles). */
const M_PER_PX_Z0 = 78271.517;
const FIT_MIN = 9;
const FIT_MAX = 15;

/**
 * R-04.15 auto-fit: camera that shows a circle of `fitM` metres around `p` inside the map area
 * above the sheet. The map is `w`×`h`; the sheet covers its bottom `sheet` px, so the camera
 * centre moves south by half the sheet to keep `p` in the middle of the visible part.
 */
export function fitCamera(p: { lat: number; lng: number }, fitM: number | null | undefined, w: number, h: number, sheet: number): { lat: number; lng: number; zoom: number } {
  const visible = Math.max(120, h - sheet);
  const cos = Math.cos((p.lat * Math.PI) / 180);
  let zoom = START_ZOOM;
  if (fitM && fitM > 0) {
    const px = Math.max(60, Math.min(w, visible) / 2 - 28);
    zoom = Math.log2((M_PER_PX_Z0 * cos * px) / fitM);
    zoom = Math.min(FIT_MAX, Math.max(FIT_MIN, Math.round(zoom * 4) / 4));
  }
  const mpp = (M_PER_PX_Z0 * cos) / 2 ** zoom;
  const shift = Math.max(0, h / 2 - visible / 2);
  return { lat: p.lat - (shift * mpp) / 111_320, lng: p.lng, zoom };
}

const NEAR = new Set(['lt200', '200_500', '500_1k', '1_2k']);

/** R-04.16: someone visible within 2 km? */
export function isNear(d: Card['distance']): boolean {
  if (!d) return false;
  if (d.kind === 'exact') return d.m < 2000;
  if (d.kind === 'area') return NEAR.has(d.bucket);
  return false;
}
