import type { Box } from '../overlay/geometry.ts';
import { BANDS, LUMA, histogram, type Histogram } from './levels.ts';

// The browser side of the exposure aids, loaded on first use.
// - Picture aids (zebras, false colour, focus peaking): one WebGL2 fragment
//   shader drawn into a canvas laid exactly over the live video. Per-pixel work
//   stays on the GPU, so it keeps up with the camera on mid-range phones;
//   nothing is copied back to JavaScript.
// - Histogram: a small copy of the framed area, read about ten times a second
//   (plain 2D canvas, so it works without WebGL2 too).

export interface AidFrame {
  /** 0 = none, 1 = zebras, 2 = false colour. */
  mode: 0 | 1 | 2;
  /** Zebra threshold, signal 0 to 1. */
  zebra: number;
  /** Peaking threshold (Sobel magnitude / 4); 0 = peaking off. */
  peak: number;
  peakColor: [number, number, number];
  /** Zebra stripe period in canvas pixels. */
  stripe: number;
}

export interface AidRenderer {
  draw(video: HTMLVideoElement, f: AidFrame): void;
  dispose(): void;
  /** Shortest time between draws in ms (0 = every camera frame). */
  interval: number;
}

/** Longest canvas side. Peaking still samples the video at its own resolution. */
const MAX_SIDE = 1280;
/**
 * Without a usable GPU the browser renders WebGL on the CPU (SwiftShader,
 * llvmpipe). The aids then draw smaller and about 12 times a second, so they
 * do not slow the whole page down.
 */
const SOFTWARE = { maxSide: 640, interval: 80 };

const VERT = `#version 300 es
out vec2 v_uv;
void main() {
  // One triangle covering the screen; the video's first row is the top.
  vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
  v_uv = vec2((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform int u_mode;
uniform float u_zebra;
uniform float u_stripe;
uniform float u_peak;
uniform vec3 u_peakColor;
uniform float u_lo[${BANDS.length}];
uniform float u_hi[${BANDS.length}];
uniform vec3 u_col[${BANDS.length}];
in vec2 v_uv;
out vec4 o;
const vec3 W = vec3(${LUMA.join(', ')});
float Y(vec2 d) { return dot(texture(u_tex, v_uv + d * u_texel).rgb, W); }
void main() {
  float y = dot(texture(u_tex, v_uv).rgb, W);
  o = vec4(0.0);
  if (u_mode == 2) {
    o = vec4(vec3(0.12 + y * 0.76), 1.0);
    for (int i = 0; i < ${BANDS.length}; i++) {
      if (y >= u_lo[i] && y < u_hi[i]) { o = vec4(u_col[i], 1.0); break; }
    }
  } else if (u_mode == 1 && y >= u_zebra && mod(gl_FragCoord.x + gl_FragCoord.y, u_stripe) < u_stripe * 0.5) {
    o = vec4(vec3(0.08), 1.0);
  }
  if (u_peak > 0.0) {
    float a = Y(vec2(-1.0, -1.0)), b = Y(vec2(0.0, -1.0)), c = Y(vec2(1.0, -1.0));
    float d = Y(vec2(-1.0, 0.0)), f = Y(vec2(1.0, 0.0));
    float g = Y(vec2(-1.0, 1.0)), h = Y(vec2(0.0, 1.0)), i = Y(vec2(1.0, 1.0));
    float gx = c + 2.0 * f + i - a - 2.0 * d - g;
    float gy = g + 2.0 * h + i - a - 2.0 * b - c;
    if (length(vec2(gx, gy)) * 0.25 > u_peak) o = vec4(u_peakColor, 1.0);
  }
}`;

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
};

/** Null when the browser has no WebGL2 (the panel then says the picture aids are unavailable). */
export function createRenderer(canvas: HTMLCanvasElement): AidRenderer | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  const maxSide = software ? SOFTWARE.maxSide : MAX_SIDE;

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  gl.useProgram(prog);
  const u = (name: string) => gl.getUniformLocation(prog, name);

  gl.uniform1fv(u('u_lo'), BANDS.map((b) => b.lo));
  gl.uniform1fv(u('u_hi'), BANDS.map((b) => b.hi));
  gl.uniform3fv(u('u_col'), BANDS.flatMap((b) => hexRgb(b.color)));

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.clearColor(0, 0, 0, 0);

  const loc = { texel: u('u_texel'), mode: u('u_mode'), zebra: u('u_zebra'), stripe: u('u_stripe'), peak: u('u_peak'), peakColor: u('u_peakColor') };

  return {
    interval: software ? SOFTWARE.interval : 0,
    draw(video, f) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh || gl.isContextLost()) return;
      const scale = Math.min(1, maxSide / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.uniform2f(loc.texel, 1 / vw, 1 / vh);
      gl.uniform1i(loc.mode, f.mode);
      gl.uniform1f(loc.zebra, f.zebra);
      // At least 6 canvas pixels per stripe: finer stripes alias on low-resolution cameras.
      gl.uniform1f(loc.stripe, Math.max(6, f.stripe));
      gl.uniform1f(loc.peak, f.peak);
      gl.uniform3fv(loc.peakColor, f.peakColor);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
    },
  };
}

/** "#rrggbb" to 0-1 components. */
export { hexRgb };

/** Width of the histogram sample; about 10 000 pixels for a 2.39:1 frame. */
const SAMPLE_WIDTH = 160;
let sampler: CanvasRenderingContext2D | null = null;

/** Histogram of `region` (fractions of the video picture). */
export function sampleHistogram(video: HTMLVideoElement, region: Box): Histogram | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const sw = region.w * vw;
  const sh = region.h * vh;
  const w = Math.max(1, Math.round(Math.min(SAMPLE_WIDTH, sw)));
  const h = Math.max(1, Math.round((w * sh) / sw));
  sampler ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!sampler) return null;
  const c = sampler.canvas;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  sampler.drawImage(video, region.x * vw, region.y * vh, sw, sh, 0, 0, w, h);
  return histogram(sampler.getImageData(0, 0, w, h).data);
}
