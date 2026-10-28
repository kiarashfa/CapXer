import { captureRect } from './lens.ts';
import type { Box } from '../overlay/geometry.ts';

// Photo of the framed view: the frame cut out of the live video at the
// video's own resolution, with a small card of the setup underneath. Drawn on
// a canvas in the browser and handed to the user as a file; nothing leaves the
// device. Loaded on demand.

const MIN_WIDTH = 1080;
const MAX_WIDTH = 3840;

export interface PhotoInput {
  video: HTMLVideoElement;
  /** The frame, as fractions of the stage. */
  frame: Box;
  /** The video's box, as fractions of the stage (videoBox()). */
  box: Box;
  /** Card lines, first one in bold. */
  lines: string[];
  colors: { bg: string; ink: string; muted: string; hatch: string };
}

export async function takePhoto({ video, frame, box, lines, colors }: PhotoInput): Promise<Blob> {
  const src = captureRect(frame, box, { width: video.videoWidth, height: video.videoHeight });
  // Native pixels where possible; small digital crops are scaled up so the card stays readable.
  const scale = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, src.w)) / src.w;
  const w = Math.round(src.w * scale);
  const h = Math.round(src.h * scale);
  const pad = Math.round(w * 0.025);
  const size = Math.max(14, Math.round(w * 0.018));
  const card = pad * 2 + size * 1.5 * lines.length;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = Math.round(h + card);
  const ctx = canvas.getContext('2d')!;

  // Outside the camera's view (lens wider than the camera): hatched, like on screen.
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.strokeStyle = colors.hatch;
  ctx.lineWidth = Math.max(1, w / 900);
  const step = Math.max(6, w / 120);
  for (let x = -h; x < w; x += step) {
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
  }
  ctx.stroke();
  ctx.restore();

  // Clip the source to the video so every browser draws only real pixels.
  const sx = Math.max(0, src.x);
  const sy = Math.max(0, src.y);
  const ex = Math.min(video.videoWidth, src.x + src.w);
  const ey = Math.min(video.videoHeight, src.y + src.h);
  if (ex > sx && ey > sy) ctx.drawImage(video, sx, sy, ex - sx, ey - sy, (sx - src.x) * scale, (sy - src.y) * scale, (ex - sx) * scale, (ey - sy) * scale);

  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 600 : 400} ${size}px "JetBrains Mono Variable", ui-monospace, monospace`;
    ctx.fillStyle = i === 0 ? colors.ink : colors.muted;
    ctx.fillText(line, pad, h + pad + i * size * 1.5, w - 2 * pad);
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92));
}

/** Phone: the share sheet (save to photos, send). Otherwise, or if sharing is not possible: a download. */
export async function savePhoto(blob: Blob, name: string, preferShare: boolean): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: 'image/jpeg' });
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export function photoName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `capxer-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}
