import { getDevice } from '../data/index.ts';
import { fovFromDeviceCamera, fovFromDiagonal, fovFromEquivalent, type Calibration, type CameraFov } from './lens.ts';

// Which phone or webcam the live view assumes, and its field of view.

/** Used until the user picks their device: a cited phone or webcam, labelled as an assumption. */
export const ASSUMED = {
  phone: { deviceId: 'samsung/galaxy-s25', cameraId: 'wide' },
  desktop: { deviceId: 'logitech/c920', cameraId: 'main' },
} as const;

export function calibrationFov(c: Calibration): CameraFov {
  if (c.kind === 'equivalent') return fovFromEquivalent(c.mm);
  if (c.kind === 'diagonal') return fovFromDiagonal(c.degrees);
  const dev = getDevice(c.deviceId);
  const cam = dev?.cameras.find((x) => x.id === c.cameraId) ?? dev?.cameras[0] ?? getDevice(ASSUMED.phone.deviceId)!.cameras[0]!;
  return fovFromDeviceCamera(cam);
}
