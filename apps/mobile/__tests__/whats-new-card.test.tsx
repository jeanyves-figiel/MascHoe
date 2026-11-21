// F-17 R-17.15 (#238): the card opens once over a quiet Explore, waits otherwise, and stays local.
import { expect, jest, test, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// The real Sheet needs the native pan gesture; render its content when visible.
jest.mock('../src/ui', () => {
  const actual = jest.requireActual('../src/ui') as object;
  const { View } = require('react-native');
  return { ...actual, afterSheet: (fn: () => void) => fn(), Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null) };
});

const { WhatsNewCard, SEEN_KEY } = require('../src/whatsnew/WhatsNew');
const { NOTES } = require('../src/whatsnew/notes');
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
});

test('fresh install: no card, newest note marked seen', async () => {
  await render(<WhatsNewCard ready onOpen={() => {}} onHistory={() => {}} />);
  await flush();
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(screen.queryByTestId('whats-new')).toBeNull();
  expect(await AsyncStorage.getItem(SEEN_KEY)).toBe(String(NOTES[0].id));
});

test('upgrade: waits for ready, then shows once; Got it marks seen', async () => {
  await AsyncStorage.setItem('thirstr.prefs', '{}');
  const r = await render(<WhatsNewCard ready={false} onOpen={() => {}} onHistory={() => {}} />);
  await flush();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(screen.queryByTestId('whats-new')).toBeNull();
  await r.rerender(<WhatsNewCard ready onOpen={() => {}} onHistory={() => {}} />);
  await act(async () => { jest.advanceTimersByTime(1300); });
  expect(screen.getByTestId('whats-new')).toBeTruthy();
  fireEvent.press(screen.getByTestId('whats-new-ok'));
  await flush();
  expect(await AsyncStorage.getItem(SEEN_KEY)).toBe(String(NOTES[0].id));
  expect(screen.queryByTestId('whats-new')).toBeNull();
});

test('already seen: nothing', async () => {
  await AsyncStorage.setItem('thirstr.prefs', '{}');
  await AsyncStorage.setItem(SEEN_KEY, String(NOTES[0].id));
  await render(<WhatsNewCard ready onOpen={() => {}} onHistory={() => {}} />);
  await flush();
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(screen.queryByTestId('whats-new')).toBeNull();
});
