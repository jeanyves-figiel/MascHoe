import { Camera, CameraRef, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import React, { useEffect, useRef } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { distanceLabel } from '../i18n/app';
import { color, type } from '../theme/tokens';
import { cellLabels, cellsGeoJSON, initial, MapProps, START_ZOOM, STYLE_URL } from './mapShared';

// S-10 map (native, MapLibre). Avatars sit at server-chosen stable random points inside their
// cell (R-05.3); exact pins are drawn only when the server returned them for this viewer.
export function ExploreMap({ center, me, data, accent, recenter, onRegion, onSelect, onClear, selected }: MapProps) {
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
      {people.map((c) => {
        if (c.lat === undefined || c.lng === undefined) return null;
        const on = selected === c.id;
        const size = on ? 58 : 44;
        return (
          <Marker key={c.id} id={c.id} lngLat={[c.lng, c.lat]} anchor="center">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${c.display_name}, ${c.age}, ${distanceLabel(c.distance)}`}
              onPress={() => onSelect(c)}
              style={{ alignItems: 'center' }}
            >
              <View
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderWidth: 3,
                  borderColor: on || c.now ? accent : c.exact ? color.trust : color.bgInverse,
                  backgroundColor: accent,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {c.photo ? <Image source={{ uri: c.photo }} style={{ width: size - 6, height: size - 6 }} /> : <Text style={{ ...type.headline, color: color.onAccent }}>{initial(c.display_name)}</Text>}
              </View>
              {on ? (
                <View style={{ marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: color.bgInverse }}>
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
