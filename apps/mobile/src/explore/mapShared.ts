import { cellToBoundary } from 'h3-js';
import { API_BASE } from '../api/client';
import type { Card, MapData } from '../api/types';

// Tiles + style come through our API (/v1/tiles), never a third-party host (I-03).
export const STYLE_URL = API_BASE + '/tiles/style.json';

export type MapProps = {
  center: { lat: number; lng: number } | null;
  me: { lat: number; lng: number } | null;
  data: MapData | null;
  accent: string;
  onRegion: (bbox: [number, number, number, number]) => void;
  onSelect: (card: Card) => void;
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

export function initial(name: string) {
  return (name.trim()[0] ?? '?').toUpperCase();
}
