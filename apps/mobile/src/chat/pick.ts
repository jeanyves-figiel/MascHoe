// R-08.12 tray selection: tap order, tap again removes, max 10.
import type { Source } from './media';

export const MAX_PICK = 10;
export type Pick = { key: string; src: Source };

export function toggle(sel: Pick[], p: Pick, max = MAX_PICK): Pick[] {
  if (sel.some((s) => s.key === p.key)) return sel.filter((s) => s.key !== p.key);
  return sel.length >= max ? sel : [...sel, p];
}
