import { v3De, v3En, v3Fr } from '../src/i18n/v3';

// #102: Me + Settings v3 copy is complete in fr and de (no silent English fallback).
function keys(o: object, p = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
}

describe('v3 strings', () => {
  const en = keys(v3En).sort();
  it.each([
    ['fr', v3Fr],
    ['de', v3De],
  ])('%s covers every en key', (_l, t) => {
    expect(keys(t).sort()).toEqual(en);
  });
});
