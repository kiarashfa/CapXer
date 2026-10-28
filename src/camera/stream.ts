import type { ZoomRange } from './lens.ts';

// The browser side of the live camera: start and stop a stream, list cameras,
// and read what the device can do. Capability layers: the base stream always;
// zoom (and later torch, focus, exposure) only when getCapabilities() reports
// it. Nothing is assumed per browser; iOS Safari simply reports less.
// Loaded on demand (dynamic import) when the user turns on Live.

export type LiveError = 'unsupported' | 'insecure' | 'denied' | 'none' | 'busy' | 'error';

export interface Capabilities {
  zoom?: ZoomRange;
  torch: boolean;
}

export interface CameraInfo {
  deviceId: string;
  label: string;
}

/** Camera support without asking for anything. */
export function support(): LiveError | null {
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}

/** "denied" when the browser already knows the camera is blocked (where the Permissions API can tell). */
export async function knownDenied(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state === 'denied';
  } catch {
    return false;
  }
}

export function errorKind(e: unknown): LiveError {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'none';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  if (name === 'SecurityError') return 'insecure';
  return 'error';
}

/**
 * Open a camera. Without a deviceId the back camera is preferred. `zoom: true`
 * asks Chromium for zoom control where the camera has it; other browsers
 * ignore the unknown constraint.
 */
export async function open(deviceId?: string, facing: 'environment' | 'user' = 'environment'): Promise<MediaStream> {
  const video: MediaTrackConstraints & { zoom?: boolean } = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }),
    zoom: true,
  };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

export function close(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function capabilities(track: MediaStreamTrack): Capabilities {
  const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number }; torch?: boolean };
  const zoom = caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step } : undefined;
  return { zoom, torch: !!caps.torch };
}

export async function setZoom(track: MediaStreamTrack, zoom: number): Promise<boolean> {
  try {
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}

/** Video inputs. Labels are only filled in after permission was granted. */
export async function listCameras(): Promise<CameraInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}
