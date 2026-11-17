import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { color, type } from '../theme/tokens';
import { cellsGeoJSON, initial, MapProps, STYLE_URL } from './mapShared';

// S-10 map (native, MapLibre). Avatars sit at server-chosen stable random points inside their
// cell (R-05.3); exact pins are drawn only when the server returned them for this viewer.
export function ExploreMap({ center, me, data, accent, onRegion, onSelect }: MapProps) {
  const people = [...(data?.avatars ?? []), ...(data?.pins ?? [])];
  return (
    <Map
      style={{ flex: 1 }}
      mapStyle={STYLE_URL}
      attribution={false}
      logo={false}
      compass={false}
      touchPitch={false}
      onRegionDidChange={(e) => onRegion(e.nativeEvent.bounds)}
    >
      <Camera initialViewState={center ? { center: [center.lng, center.lat], zoom: 14 } : { zoom: 2 }} />
      <GeoJSONSource id="cells" data={cellsGeoJSON(data)}>
        <Layer id="cells-fill" type="fill" paint={{ 'fill-color': accent, 'fill-opacity': ['get', 'w'] }} />
      </GeoJSONSource>
      {me ? (
        <Marker lngLat={[me.lng, me.lat]} anchor="center">
          <View accessibilityLabel="You" style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color.bgInverse, borderWidth: 6, borderColor: accent }} />
        </Marker>
      ) : null}
      {people.map((c) =>
        c.lat !== undefined && c.lng !== undefined ? (
          <Marker key={c.id} id={c.id} lngLat={[c.lng, c.lat]} anchor="center">
            <Pressable accessibilityRole="button" accessibilityLabel={`${c.display_name}, ${c.age}`} onPress={() => onSelect(c)}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  borderWidth: 3,
                  borderColor: c.exact ? color.trust : c.now ? accent : color.bgBase,
                  backgroundColor: accent,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {c.photo ? <Image source={{ uri: c.photo }} style={{ width: 36, height: 36 }} /> : <Text style={{ ...type.headline, color: color.onAccent }}>{initial(c.display_name)}</Text>}
              </View>
            </Pressable>
          </Marker>
        ) : null,
      )}
    </Map>
  );
}
