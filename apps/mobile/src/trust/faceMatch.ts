// F-18 R-18.15 (#185): verdict of the video check face match. The phone compares 3 frames of the clip with
// the largest face in each of the peer's public photos (SFace, Core ML, on device) and hands back one
// similarity per frame. Nothing here is stored or sent.
import type { ClipMatch } from '../../modules/thirstr-face';

/** Cosine similarity for "same person". OpenCV's LFW threshold for SFace is 0.363; a bit stricter here. */
export const MATCH_AT = 0.4;
/** Frames that must show a face, and frames that must match. */
export const MIN_FACE_FRAMES = 2;
export const MIN_MATCH_FRAMES = 2;
/** Main photo + up to 5 public photos (R-05). */
export const MAX_PHOTOS = 6;

export type Verdict = 'match' | 'nomatch' | null;

/** null = show nothing (no photo with a face, or too few frames with a face). */
export function verdict(m: ClipMatch | null | undefined): Verdict {
  if (!m || m.photoFaces < 1) return null;
  const faces = m.frames.filter((s) => s >= 0);
  if (faces.length < MIN_FACE_FRAMES) return null;
  return faces.filter((s) => s >= MATCH_AT).length >= MIN_MATCH_FRAMES ? 'match' : 'nomatch';
}

/** Public photo URLs to compare against, main photo first, https only. */
export const photoTargets = (photos: (string | null | undefined)[]): string[] =>
  photos.filter((u): u is string => typeof u === 'string' && u.startsWith('https://')).slice(0, MAX_PHOTOS);
