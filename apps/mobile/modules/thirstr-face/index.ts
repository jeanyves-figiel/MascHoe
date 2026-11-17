import { requireOptionalNativeModule } from 'expo';

/** Face measurements from Apple Vision (iOS only). Numbers only; the photo stays on the device. */
export type FaceReading = { faces: number; yaw?: number; pitch?: number; roll?: number; size?: number; leftEye?: number; rightEye?: number; mouth?: number };

type Native = { analyze(uri: string): Promise<FaceReading> };

const native = requireOptionalNativeModule<Native>('ThirstrFace');

export const faceAvailable = !!native;
export const analyzeFace = (uri: string): Promise<FaceReading> => (native ? native.analyze(uri) : Promise.reject(new Error('unavailable')));
