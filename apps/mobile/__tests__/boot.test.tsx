// Regression for #88: the app must draw on launch even when native safe-area insets never
// arrive (blank screen on iPhone).
import { expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@maplibre/maplibre-react-native', () => ({ Camera: 'Camera', GeoJSONSource: 'GeoJSONSource', Layer: 'Layer', Map: 'Map', Marker: 'Marker' }));

test('App draws something on launch', async () => {
  require('../src/crypto/setup');
  const App = (require('../App') as { default: React.ComponentType }).default;
  render(<App />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 3200));
  });
  const tree = screen.toJSON() as { children?: unknown[] } | null;
  expect(tree?.children?.length ?? 0).toBeGreaterThan(0);
}, 20000);
