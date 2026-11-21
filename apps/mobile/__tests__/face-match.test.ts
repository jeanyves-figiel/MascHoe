import { describe, expect, it } from '@jest/globals';
import { MATCH_AT, photoTargets, verdict } from '../src/trust/faceMatch';

describe('video check face match verdict (R-18.15)', () => {
  it('shows nothing without a face in his photos', () => {
    expect(verdict({ photoFaces: 0, frames: [] })).toBeNull();
    expect(verdict(null)).toBeNull();
  });
  it('shows nothing when fewer than 2 frames show a face', () => {
    expect(verdict({ photoFaces: 2, frames: [0.9, -1, -1] })).toBeNull();
  });
  it('matches when 2 of 3 frames pass', () => {
    expect(verdict({ photoFaces: 1, frames: [0.62, 0.2, MATCH_AT] })).toBe('match');
    expect(verdict({ photoFaces: 1, frames: [0.7, -1, 0.55] })).toBe('match');
  });
  it('one matching frame is not enough', () => {
    expect(verdict({ photoFaces: 3, frames: [0.8, 0.31, 0.12] })).toBe('nomatch');
    expect(verdict({ photoFaces: 3, frames: [0.39, 0.39, 0.39] })).toBe('nomatch');
  });
  it('compares against at most 6 https photos, in order', () => {
    const urls = ['https://a/1', null, 'http://x', 'file:///y', ...Array.from({ length: 8 }, (_, i) => `https://a/${i + 2}`)];
    expect(photoTargets(urls)).toEqual(['https://a/1', 'https://a/2', 'https://a/3', 'https://a/4', 'https://a/5', 'https://a/6']);
  });
});
