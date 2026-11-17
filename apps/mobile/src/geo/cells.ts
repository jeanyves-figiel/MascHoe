import { cellToLatLng, latLngToCell } from 'h3-js';

// Client computes H3 cells; the server never receives coordinates for City/Area (F-05).
// Native builds move this into the Rust core (UniFFI); same outputs.
export function areaCell(lat: number, lng: number): string {
  return latLngToCell(lat, lng, 9);
}

export function cellCenter(cell: string): [number, number] {
  return cellToLatLng(cell);
}
