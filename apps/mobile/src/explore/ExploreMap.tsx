import { Camera, CameraRef, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { distanceLabel, tx } from '../i18n/app';
import { pl } from '../i18n/places';
import { color, type } from '../theme/tokens';
import { RingPin } from './IntentRing';
import { cellLabels, cellsGeoJSON, MapProps, pinLabel, START_ZOOM, STYLE_URL } from './mapShared';
import { PlaceMarker } from './Places';

// S-10 map (native, MapLibre). Avatars sit at server-chosen stable random points inside their
// cell (R-05.3); exact pins are drawn only when the server returned them for this viewer.
export function ExploreMap({ center, me, data, accent, recenter, onRegion, onSelect, onClear, selected, places, onPlace, selectedPlace }: MapProps) {
  const people = [...(data?.avatars ?? []), ...(data?.pins ?? [])];
  const camera = useRef<CameraRef>(null);
  // R-04.13: initialViewState only applies at mount, so centre once when the first position
  // arrives (unless the user already moved the map), and again on each Locate me.
  const centred = useRef(!!center);
  const touched = useRef(false);
  useEffect(() => {
    if (!center || centred.current || touched.current) return;
    centred.current = true;
    camera.current?.jumpTo({ center: [center.lng, center.lat], zoom: center.zoom ?? START_ZOOM });
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!recenter || !center) return;
    centred.current = true;
    camera.current?.easeTo({ center: [center.lng, center.lat], zoom: center.zoom ?? START_ZOOM, duration: 600 });
  }, [recenter]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Map
      style={{ flex: 1 }}
      mapStyle={STYLE_URL}
      attribution={false}
      logo={false}
      compass={false}
      touchPitch={false}
      onPress={() => onClear?.()}
      onRegionWillChange={(e) => {
        if (e.nativeEvent.userInteraction) touched.current = true;
      }}
      onRegionDidChange={(e) => onRegion(e.nativeEvent.bounds)}
    >
      <Camera ref={camera} initialViewState={center ? { center: [center.lng, center.lat], zoom: center.zoom ?? START_ZOOM } : { zoom: 2 }} />
      <GeoJSONSource id="cells" data={cellsGeoJSON(data)}>
        <Layer id="cells-fill" type="fill" paint={{ 'fill-color': accent, 'fill-opacity': ['get', 'w'] }} />
        <Layer id="cells-line" type="line" paint={{ 'line-color': accent, 'line-opacity': 0.45, 'line-width': 1 }} />
      </GeoJSONSource>
      {people.length === 0
        ? cellLabels(data).map((c) => (
            <Marker key={c.key} id={`cell-${c.key}`} lngLat={[c.lng, c.lat]} anchor="center">
              <View pointerEvents="none" style={{ minWidth: 34, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: color.bgInverse, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...type.caption, fontSize: 12, color: color.onAccent }}>{c.label}</Text>
              </View>
            </Marker>
          ))
        : null}
      {me ? (
        <Marker lngLat={[me.lng, me.lat]} anchor="center">
          <View accessibilityLabel="You" style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color.bgInverse, borderWidth: 6, borderColor: accent }} />
        </Marker>
      ) : null}
      {/* R-04.20: places under people */}
      {(places ?? []).map((p) => (
        <Marker key={`pl-${p.id}`} id={`pl-${p.id}`} lngLat={[p.lng, p.lat]} anchor="center">
          <Pressable accessibilityRole="button" accessibilityLabel={`${pl.kind[p.kind] ?? p.kind}: ${p.name}`} onPress={() => onPlace?.(p)}>
            <PlaceMarker p={p} selected={selectedPlace === p.id} />
          </Pressable>
        </Marker>
      ))}
      {people.map((c) => {
        if (c.lat === undefined || c.lng === undefined) return null;
        const on = selected === c.id;
        return (
          <Marker key={c.id} id={c.id} lngLat={[c.lng, c.lat]} anchor="center">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={pinLabel(c, tx.modes, pl.and, distanceLabel(c.distance), pl.lookingFor)}
              onPress={() => onSelect(c)}
              style={{ alignItems: 'center' }}
            >
              <RingPin card={c} selected={on} />
              {on ? (
                <View style={{ marginTop: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: color.bgInverse }}>
                  <Text style={{ ...type.caption, fontSize: 13, color: color.onAccent }}>{`${c.display_name}, ${c.age} · ${distanceLabel(c.distance)}`}</Text>
                </View>
              ) : null}
            </Pressable>
          </Marker>
        );
      })}
    </Map>
  );
}
