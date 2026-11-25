import {
  CustomBlending,
  HalfFloatType,
  Mesh,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SrcAlphaFactor,
  UnsignedByteType,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';

// Progressive accumulation (v2 lab). One sample = one full render with the
// camera moved across the lens pupil, a moment inside the shutter time, the
// lights moved across their size and a sub-pixel shift; samples are averaged
// into a half-float target that holds scene luminance in cd/m2.
//
// Showing it: luminance x exposure scale (optics pictureValue), then a filmic
// tone curve (Narkowicz's fit of ACES, our choice) and the sRGB transfer.
// Metering: luminance of a small grid of points, packed into 8-bit pixels and
// read back without stalling the GPU (readRenderTargetPixelsAsync).

const QUAD_VS =
  'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const LUMA = 'const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);';

/** Size of the picture copy the histogram counts. */
export const HIST_W = 160;
export const HIST_H = 90;

/** Aids drawn over the picture (0 none, 1 zebras, 2 false colour). */
export type AidMode = 0 | 1 | 2;

/** Colours of the false-colour bands, sRGB 0 to 1, in the order the shader expects. */
export interface BandColours {
  clipped: [number, number, number];
  nearClip: [number, number, number];
  overGrey: [number, number, number];
  grey: [number, number, number];
  shadow: [number, number, number];
  crushed: [number, number, number];
}

export const METER_W = 96;
export const METER_H = 54;

export interface SampleHooks {
  /** Before sample i of n is drawn: move camera, lights and moving things. */
  before(i: number, n: number): void;
  /** After the sample: put everything back. */
  after(): void;
}

export class Accumulator {
  readonly sample: WebGLRenderTarget;
  readonly accum: WebGLRenderTarget;
  private readonly meterTarget: WebGLRenderTarget;
  private readonly histTarget: WebGLRenderTarget;
  private readonly blend: ShaderMaterial;
  private readonly show: ShaderMaterial;
  private readonly meter: ShaderMaterial;
  private readonly quad: Mesh;
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** Samples drawn so far. */
  n = 0;
  target = 64;

  private readonly renderer: WebGLRenderer;

  constructor(renderer: WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;
    this.sample = new WebGLRenderTarget(width, height, { type: HalfFloatType, depthBuffer: true });
    this.accum = new WebGLRenderTarget(width, height, { type: HalfFloatType, depthBuffer: false });
    this.meterTarget = new WebGLRenderTarget(METER_W, METER_H, {
      type: UnsignedByteType,
      depthBuffer: false,
    });
    this.histTarget = new WebGLRenderTarget(HIST_W, HIST_H, {
      type: UnsignedByteType,
      depthBuffer: false,
    });
    this.blend = new ShaderMaterial({
      uniforms: { tex: { value: this.sample.texture }, weight: { value: 1 } },
      vertexShader: QUAD_VS,
      fragmentShader:
        'uniform sampler2D tex; uniform float weight; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tex, vUv).rgb, weight); }',
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.show = new ShaderMaterial({
      uniforms: {
        tex: { value: this.accum.texture },
        scale: { value: 1 },
        gains: { value: [1, 1, 1] },
        noiseA: { value: 0 },
        noiseB: { value: 0 },
        seed: { value: 0 },
        aid: { value: 0 },
        zebraLevel: { value: 0.95 },
        cClipped: { value: [1, 0, 0] },
        cNear: { value: [1, 1, 0] },
        cOver: { value: [1, 0.5, 0.7] },
        cGrey: { value: [0.2, 0.7, 0.3] },
        cShadow: { value: [0.2, 0.4, 0.9] },
        cCrushed: { value: [0.5, 0.2, 1] },
      },
      vertexShader: QUAD_VS,
      // White balance gains, exposure, sensor noise (sigma^2 = v a + b, see
      // render/noise.ts; a fixed pattern per picture so it never shimmers),
      // then the tone curve and sRGB. Aids last:
      // - zebras on the picture signal (luma of the encoded picture), like a camera monitor;
      // - false colour: clipping and crushed blacks on the picture signal; middle grey
      //   (within 1/4 stop), one stop over and deep shadow (3 stops under) measured on
      //   the light that reached the sensor, in stops around the 18 % grey the meter aims
      //   for. The lab's tone curve is not BT.709's, so signal levels alone would miss them.
      fragmentShader: `uniform sampler2D tex; uniform float scale; uniform vec3 gains;
        uniform float noiseA; uniform float noiseB; uniform float seed; varying vec2 vUv;
        uniform int aid; uniform float zebraLevel;
        uniform vec3 cClipped; uniform vec3 cNear; uniform vec3 cOver; uniform vec3 cGrey; uniform vec3 cShadow; uniform vec3 cCrushed;
        ${LUMA}
        vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
        float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        float gauss(vec2 px, float k) {
          float u1 = max(hash(vec3(px, seed + k)), 1e-6);
          float u2 = hash(vec3(px.yx, seed + k + 17.0));
          return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2);
        }
        void main() {
          vec3 v = max(texture2D(tex, vUv).rgb * gains * scale, 0.0);
          if (noiseA > 0.0) {
            vec2 px = floor(gl_FragCoord.xy);
            float shared = gauss(px, 0.0);
            vec3 n = vec3(gauss(px, 1.0), gauss(px, 2.0), gauss(px, 3.0)) * 0.8 + shared * 0.6;
            v = max(v + n * sqrt(v * noiseA + noiseB), 0.0);
          }
          vec3 c = srgb(aces(v));
          float ys = dot(c, LUMA);
          if (aid == 1 && ys >= zebraLevel) {
            float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 12.0));
            c = mix(c, vec3(stripe), 0.7);
          } else if (aid == 2) {
            float stops = log2(max(dot(v, LUMA), 1e-6) / 0.18);
            if (ys >= 0.99) c = cClipped;
            else if (ys >= 0.95) c = cNear;
            else if (abs(stops - 1.0) <= 0.25) c = cOver;
            else if (abs(stops) <= 0.25) c = cGrey;
            else if (ys < 0.02) c = cCrushed;
            else if (stops <= -3.0) c = cShadow;
            else c = vec3(ys);
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.meter = new ShaderMaterial({
      uniforms: { tex: { value: this.accum.texture } },
      vertexShader: QUAD_VS,
      // Y / (Y + 1) maps 0..infinity cd/m2 into 0..1; packed into four bytes.
      fragmentShader: `uniform sampler2D tex; varying vec2 vUv; ${LUMA}
        vec4 pack(float v) { vec4 e = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * v); return e - e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0); }
        void main() { float y = max(dot(texture2D(tex, vUv).rgb, LUMA), 0.0); gl_FragColor = pack(min(y / (y + 1.0), 0.99999)); }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.blend);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  get done(): boolean {
    return this.n >= this.target;
  }

  setSize(width: number, height: number) {
    if (width === this.sample.width && height === this.sample.height) return;
    this.sample.setSize(width, height);
    this.accum.setSize(width, height);
    this.reset();
  }

  reset() {
    this.n = 0;
  }

  /** Draw up to `count` samples. */
  step(scene: Scene, camera: PerspectiveCamera, hooks: SampleHooks, count: number) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    for (let k = 0; k < count && !this.done; k++) {
      const i = this.n;
      hooks.before(i, this.target);
      r.setRenderTarget(this.sample);
      r.autoClear = true;
      r.render(scene, camera);
      hooks.after();
      this.blend.uniforms.weight!.value = 1 / (i + 1);
      this.quad.material = this.blend;
      r.setRenderTarget(this.accum);
      r.autoClear = false;
      r.render(this.quadScene, this.quadCamera);
      this.n++;
    }
    r.autoClear = prevAuto;
    r.setRenderTarget(prevTarget);
  }

  /**
   * Draw the averaged picture to the screen: white balance gains, exposure
   * scale (picture value per cd/m2) and the noise coefficients for the ISO.
   */
  present(
    scale: number,
    gains: readonly [number, number, number] = [1, 1, 1],
    noise = { a: 0, b: 0 },
    seed = 0,
  ) {
    const r = this.renderer;
    this.setShow(scale, gains, noise, seed);
    this.quad.material = this.show;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }

  /** The aid drawn over the picture by present(). */
  setAid(mode: AidMode, zebraLevel: number, colours: BandColours) {
    const u = this.show.uniforms;
    u.aid!.value = mode;
    u.zebraLevel!.value = zebraLevel;
    u.cClipped!.value = colours.clipped;
    u.cNear!.value = colours.nearClip;
    u.cOver!.value = colours.overGrey;
    u.cGrey!.value = colours.grey;
    u.cShadow!.value = colours.shadow;
    u.cCrushed!.value = colours.crushed;
  }

  /** A small copy of the shown picture (no aids), 8-bit sRGB, for the histogram. */
  async readPicture(
    scale: number,
    gains: readonly [number, number, number],
    noise: { a: number; b: number },
    seed: number,
  ): Promise<Uint8Array> {
    const r = this.renderer;
    const u = this.show.uniforms;
    const aid = u.aid!.value;
    this.setShow(scale, gains, noise, seed);
    u.aid!.value = 0;
    this.quad.material = this.show;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.histTarget);
    r.render(this.quadScene, this.quadCamera);
    r.setRenderTarget(prev);
    u.aid!.value = aid;
    const px = new Uint8Array(HIST_W * HIST_H * 4);
    await r.readRenderTargetPixelsAsync(this.histTarget, 0, 0, HIST_W, HIST_H, px);
    return px;
  }

  private setShow(
    scale: number,
    gains: readonly [number, number, number],
    noise: { a: number; b: number },
    seed: number,
  ) {
    const u = this.show.uniforms;
    u.scale!.value = scale;
    u.gains!.value = [...gains];
    u.noiseA!.value = noise.a;
    u.noiseB!.value = noise.b;
    u.seed!.value = seed;
  }

  /** Average luminance of the picture (cd/m2), read back without stalling the GPU. */
  async meterLuminance(): Promise<number> {
    const r = this.renderer;
    this.quad.material = this.meter;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.meterTarget);
    r.render(this.quadScene, this.quadCamera);
    r.setRenderTarget(prev);
    const px = new Uint8Array(METER_W * METER_H * 4);
    await r.readRenderTargetPixelsAsync(this.meterTarget, 0, 0, METER_W, METER_H, px);
    return averageLuminance(px);
  }

  dispose() {
    this.sample.dispose();
    this.accum.dispose();
    this.meterTarget.dispose();
    this.histTarget.dispose();
    this.blend.dispose();
    this.show.dispose();
    this.meter.dispose();
    this.quad.geometry.dispose();
  }
}

/** Unpack the meter grid (four bytes per point, Y / (Y + 1)) and average the luminance. */
export function averageLuminance(px: Uint8Array): number {
  let sum = 0;
  const count = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    const u = px[i]! / 255 + px[i + 1]! / 65025 + px[i + 2]! / 16581375 + px[i + 3]! / 4228250625;
    sum += u / (1 - u);
  }
  return count ? sum / count : 0;
}
