import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { distanceLabel } from '../i18n/app';
import { color } from '../theme/tokens';
import { cellLabels, cellsGeoJSON, initial, MapProps, START_ZOOM, STYLE_URL } from './mapShared';

// Worker copied by scripts/copy-maplibre-worker.js (Metro has no import.meta.url).
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

// S-10 map on the web build (DEV tool). Same data, maplibre-gl.
export function ExploreMap({ center, me, data, accent, recenter, onRegion, onSelect, onClear, selected }: MapProps) {
  const clear = useRef(onClear);
  useEffect(() => {
    clear.current = onClear;
  }, [onClear]);
  const centred = useRef(!!center);
  const touched = useRef(false);
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = new maplibregl.Map({
      container: host.current,
      style: STYLE_URL,
      center: center ? [center.lng, center.lat] : [8.54, 47.37],
      zoom: center ? (center.zoom ?? START_ZOOM) : 2,
      attributionControl: false,
      pitchWithRotate: false,
    });
    const emit = () => {
      const b = m.getBounds();
      onRegion([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    m.on('moveend', emit);
    m.on('click', () => clear.current?.());
    m.on('dragstart', () => (touched.current = true));
    m.on('zoomstart', (e) => e.originalEvent && (touched.current = true));
    m.on('load', () => {
      m.addSource('cells', { type: 'geojson', data: cellsGeoJSON(null) });
      m.addLayer({ id: 'cells-fill', type: 'fill', source: 'cells', paint: { 'fill-color': accent, 'fill-opacity': ['get', 'w'] } });
      m.addLayer({ id: 'cells-line', type: 'line', source: 'cells', paint: { 'line-color': accent, 'line-opacity': 0.45, 'line-width': 1 } });
      emit();
    });
    map.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const src = m.getSource('cells') as maplibregl.GeoJSONSource | undefined;
    src?.setData(cellsGeoJSON(data));
    if (m.getLayer('cells-fill')) m.setPaintProperty('cells-fill', 'fill-color', accent);
    if (m.getLayer('cells-line')) m.setPaintProperty('cells-line', 'line-color', accent);
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const add = (lng: number, lat: number, el: HTMLElement) => markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m));
    if (me) {
      const el = document.createElement('div');
      el.style.cssText = `width:24px;height:24px;border-radius:12px;background:${color.bgInverse};border:6px solid ${accent};box-sizing:border-box`;
      add(me.lng, me.lat, el);
    }
    const people = [...(data?.avatars ?? []), ...(data?.pins ?? [])];
    if (people.length === 0)
      for (const c of cellLabels(data)) {
        const el = document.createElement('div');
        el.textContent = c.label;
        el.style.cssText = `min-width:34px;height:26px;padding:0 8px;box-sizing:border-box;border-radius:13px;background:${color.bgInverse};color:${color.onAccent};font:700 12px/26px sans-serif;text-align:center;pointer-events:none`;
        add(c.lng, c.lat, el);
      }
    for (const c of people) {
      if (c.lat === undefined || c.lng === undefined) continue;
      const on = selected === c.id;
      const size = on ? 58 : 44;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center';
      const el = document.createElement('button');
      el.setAttribute('aria-label', `${c.display_name}, ${c.age}, ${distanceLabel(c.distance)}`);
      el.setAttribute('aria-pressed', String(on));
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;border:3px solid ${on || c.now ? accent : c.exact ? color.trust : color.bgInverse};background:${accent} center/cover no-repeat;color:${color.onAccent};font:800 16px sans-serif;cursor:pointer;padding:0`;
      if (c.photo) el.style.backgroundImage = `url("${c.photo}")`;
      else el.textContent = initial(c.display_name);
      el.onclick = (e) => {
        e.stopPropagation();
        onSelect(c);
      };
      wrap.appendChild(el);
      if (on) {
        const chip = document.createElement('div');
        chip.textContent = `${c.display_name}, ${c.age} · ${distanceLabel(c.distance)}`;
        chip.style.cssText = `margin-top:6px;padding:5px 10px;border-radius:999px;background:${color.bgInverse};color:${color.onAccent};font:800 13px sans-serif;white-space:nowrap`;
        wrap.appendChild(chip);
      }
      add(c.lng, c.lat, wrap);
    }
  }, [data, me, accent, onSelect, selected]);

  // R-04.13: centre once when the first position arrives (unless the user moved), and on Locate me.
  useEffect(() => {
    if (!center || !map.current || centred.current || touched.current) return;
    centred.current = true;
    map.current.jumpTo({ center: [center.lng, center.lat], zoom: center.zoom ?? START_ZOOM });
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!recenter || !center || !map.current) return;
    centred.current = true;
    map.current.easeTo({ center: [center.lng, center.lat], zoom: center.zoom ?? START_ZOOM, duration: 600 });
  }, [recenter]); // eslint-disable-line react-hooks/exhaustive-deps

  return <View style={{ flex: 1 }}>{React.createElement('div', { ref: host, style: { position: 'absolute', inset: 0 } })}</View>;
}
