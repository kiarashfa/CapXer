<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import { onDestroy, type Component } from 'svelte';
  import {
    Color,
    NoToneMapping,
    PCFShadowMap,
    Vector3,
    type PerspectiveCamera,
    type SpotLight,
  } from 'three';
  import { kelvinToRgb } from '../../optics/index.ts';
  import {
    discPoint,
    focusShift,
    pixelJitter,
    pupilRadiusM,
    timeSample,
  } from '../../lab/camera.ts';
  import { Accumulator, type BandColours } from '../../lab/render/accumulate.ts';
  import { BANDS, histogram, zebraThreshold } from '../../analysis/levels.ts';
  import { provideMotion } from '../../lab/render/motion.ts';
  import { TIERS, nextPerFrame, tierAfter } from '../../lab/render/tiers.ts';
  import { lab } from '../../lab/store.svelte.ts';
  import type { Light, SetDef } from '../../lab/types.ts';

  // Draws the lab picture by progressive accumulation (src/lab/render/accumulate.ts).
  // Threlte runs in manual mode: a frame is drawn only while the picture is
  // still building up (or the exposure changed), so an idle lab costs nothing.

  const { renderer, scene, size, advance, renderStage } = useThrelte();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = NoToneMapping;

  const movers = provideMotion();
  const acc = new Accumulator(renderer, 2, 2);
  let camera = $state<PerspectiveCamera>();
  const spots = new Map<string, SpotLight>();

  // ---- the set and subject load on demand ----------------------------------
  let SetView = $state.raw<Component<{ set: SetDef }> | null>(null);
  let SubjectView = $state.raw<Component<{ height: number }> | null>(null);
  $effect(() => {
    const set = lab.set;
    let live = true;
    set.load().then((m) => live && (SetView = m.default));
    return () => (live = false);
  });
  $effect(() => {
    const subject = lab.subject;
    let live = true;
    subject.load().then((m) => live && (SubjectView = m.default));
    return () => (live = false);
  });

  // ---- what invalidates the picture ---------------------------------------
  // Anything that changes the scene or the optics restarts the average; an
  // exposure change (ISO only, for now) just shows the same average brighter.
  const sceneKey = $derived(
    JSON.stringify([
      lab.setId,
      lab.subject.id,
      lab.lighting.id,
      lab.lights,
      lab.ambient,
      lab.fNumber,
      lab.shutter,
      lab.focusM,
      lab.camera,
      lab.cameraAt,
      lab.focusPoint,
      lab.tier,
    ]),
  );
  let loaded = $state(0);

  let running = false;
  let lastFrame = 0;
  let perFrame = 1;
  let dirty = true;
  let metering = 0;

  function kick() {
    if (running) return;
    running = true;
    lastFrame = 0;
    requestAnimationFrame(loop);
  }

  function loop(now: number) {
    if (lastFrame) perFrame = nextPerFrame(perFrame, now - lastFrame);
    lastFrame = now;
    advance();
    if (!acc.done || dirty) requestAnimationFrame(loop);
    else running = false;
  }

  $effect(() => {
    void sceneKey;
    void loaded;
    void SetView;
    void SubjectView;
    acc.reset();
    lab.samples = 0;
    dirty = true;
    kick();
  });

  // Exposure, white balance, noise and the aids only change how the same average is shown.
  const hex = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
  const bandColours = Object.fromEntries(
    BANDS.map((b) => [b.id, hex(b.color)]),
  ) as unknown as BandColours;
  $effect(() => {
    acc.setAid(
      lab.picture === 'zebras' ? 1 : lab.picture === 'falseColour' ? 2 : 0,
      zebraThreshold(lab.zebra),
      bandColours,
    );
    void lab.exposureScale;
    void lab.gains;
    void lab.noise;
    void lab.histogram;
    dirty = true;
    kick();
  });

  // ---- render size ----------------------------------------------------------
  $effect(() => {
    const tier = TIERS[lab.tier];
    const dpr = renderer.getPixelRatio();
    const w = Math.max(2, Math.round($size.width * dpr * tier.scale));
    const h = Math.max(2, Math.round($size.height * dpr * tier.scale));
    acc.setSize(w, h);
    for (const l of spots.values()) {
      if (l.shadow.mapSize.width !== tier.shadow) {
        l.shadow.mapSize.set(tier.shadow, tier.shadow);
        l.shadow.map?.dispose();
        l.shadow.map = null;
      }
    }
    acc.target = tier.samples;
    lab.samples = 0;
    kick();
  });

  // ---- per-sample jitter ---------------------------------------------------
  const base = new Vector3();
  const right = new Vector3();
  const up = new Vector3();

  function lightOffset(light: Light, i: number, n: number, out: Vector3) {
    // Spread over the light's face, across the direction it points.
    const p = discPoint((i * 37) % n, n);
    const dir = new Vector3(
      light.aim.x - light.at.x,
      light.aim.y - light.at.y,
      light.aim.z - light.at.z,
    ).normalize();
    const a = Math.abs(dir.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const u = new Vector3().crossVectors(dir, a).normalize();
    const v = new Vector3().crossVectors(dir, u).normalize();
    const r = light.size / 2;
    out
      .set(light.at.x, light.at.y, light.at.z)
      .addScaledVector(u, p.x * r)
      .addScaledVector(v, p.y * r);
  }

  const hooks = {
    before(i: number, n: number) {
      const cam = camera!;
      base.copy(cam.position);
      right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const pupil = pupilRadiusM(lab.camera.focal, lab.fNumber);
      const d = discPoint(i, n);
      const dx = d.x * pupil;
      const dy = d.y * pupil;
      cam.position.addScaledVector(right, dx).addScaledVector(up, dy);
      cam.updateMatrixWorld();
      const shift = focusShift(dx, dy, lab.focusM, lab.camera.tanW, lab.camera.tanH);
      const j = pixelJitter(i);
      const e = cam.projectionMatrix.elements;
      e[8] = -shift.x + (2 * j.x) / acc.sample.width;
      e[9] = -shift.y + (2 * j.y) / acc.sample.height;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

      const t = timeSample(i) * lab.shutter;
      for (const m of movers) m(t);

      for (const light of lab.lights) {
        const l = spots.get(light.id);
        if (!l || light.size <= 0) continue;
        lightOffset(light, i, n, l.position);
      }
    },
    after() {
      const cam = camera!;
      cam.position.copy(base);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      for (const light of lab.lights)
        spots.get(light.id)?.position.set(light.at.x, light.at.y, light.at.z);
    },
  };

  // ---- the frame task ------------------------------------------------------
  useTask(
    () => {
      const cam = camera;
      if (!cam) return;
      if (!acc.done) {
        const t0 = performance.now();
        const before = acc.n;
        acc.step(scene, cam, hooks, perFrame);
        const drawn = acc.n - before;
        lab.samples = acc.n;
        // First frames tell us whether this machine needs a lighter tier.
        if (drawn && acc.n <= 8) {
          const next = tierAfter(lab.tier, (performance.now() - t0) / drawn);
          if (next !== lab.tier) lab.tier = next;
        }
        if (acc.done) meter();
      }
      acc.present(lab.exposureScale, lab.gains, lab.noise, GRAIN_SEED);
      dirty = false;
      if (lab.histogram && acc.done) countHistogram();
    },
    { stage: renderStage, autoInvalidate: false },
  );

  // The histogram counts a small copy of the finished picture; one count at a time.
  let counting = false;
  let countAgain = false;
  function countHistogram() {
    if (counting) {
      countAgain = true;
      return;
    }
    counting = true;
    acc
      .readPicture(lab.exposureScale, lab.gains, lab.noise, GRAIN_SEED)
      .then((px) => {
        lab.hist = histogram(new Uint8ClampedArray(px.buffer), 64);
      })
      .catch(() => {})
      .finally(() => {
        counting = false;
        if (countAgain) {
          countAgain = false;
          countHistogram();
        }
      });
  }

  function meter() {
    const id = ++metering;
    acc
      .meterLuminance()
      .then((lum) => {
        if (id === metering) lab.meteredLuminance = lum;
      })
      .catch(() => {});
  }

  function spotCreated(light: Light) {
    return (l: SpotLight) => {
      spots.set(light.id, l);
      l.target.position.set(light.aim.x, light.aim.y, light.aim.z);
      l.color.copy(lightColour(light.kelvin));
      scene.add(l.target);
      l.shadow.mapSize.set(TIERS[lab.tier].shadow, TIERS[lab.tier].shadow);
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.02;
      l.shadow.camera.near = 0.3;
      l.shadow.camera.far = 20;
      loaded++;
      return () => {
        scene.remove(l.target);
        spots.delete(light.id);
      };
    };
  }

  function cameraCreated(c: PerspectiveCamera) {
    camera = c;
    c.lookAt(lab.focusPoint.x, lab.focusPoint.y, lab.focusPoint.z);
  }

  $effect(() => {
    const c = camera;
    if (!c) return;
    c.position.set(lab.cameraAt.x, lab.cameraAt.y, lab.cameraAt.z);
    c.fov = lab.camera.vFov;
    c.lookAt(lab.focusPoint.x, lab.focusPoint.y, lab.focusPoint.z);
    c.updateProjectionMatrix();
  });

  // A light's colour follows its edited temperature.
  $effect(() => {
    for (const light of lab.lights) spots.get(light.id)?.color.copy(lightColour(light.kelvin));
  });

  const deg = (d: number) => (d * Math.PI) / 180;
  /** Fixed grain pattern: the same picture always shows the same grain (no shimmer). */
  const GRAIN_SEED = 7.13;
  const lightColour = (kelvin: number) => new Color().setRGB(...kelvinToRgb(kelvin));
  const ambientSky = $derived(lightColour(lab.lighting.ambientKelvin ?? 5600));
  const ambientGround = $derived(ambientSky.clone().multiplyScalar(0.6));
  onDestroy(() => acc.dispose());
</script>

<T.PerspectiveCamera
  makeDefault
  near={0.05}
  far={60}
  fov={lab.camera.vFov}
  position={[lab.cameraAt.x, lab.cameraAt.y, lab.cameraAt.z]}
  oncreate={cameraCreated}
/>

{#each lab.lights as light (lab.lighting.id + light.id)}
  <T.SpotLight
    position={[light.at.x, light.at.y, light.at.z]}
    intensity={light.candela}
    angle={deg(light.angle ?? 30)}
    penumbra={light.penumbra ?? 0.3}
    decay={2}
    castShadow={light.castShadow}
    oncreate={spotCreated(light)}
  />
{/each}
{#key ambientSky}
  <T.HemisphereLight args={[ambientSky, ambientGround]} intensity={lab.ambient} />
{/key}

{#if SetView}
  <SetView set={lab.set} />
{/if}
{#if SubjectView}
  <SubjectView height={lab.subject.height} />
{/if}
