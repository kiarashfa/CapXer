<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { onDestroy, onMount, tick } from 'svelte';
  import { PANEL_CLOSED_EVENT } from '../../lib/site-bar.ts';
  import { CLIP_SHARE, histogramPath } from '../../analysis/levels.ts';
  import LabPanes from './LabPanes.svelte';
  import { autosaveLab, backToMine, keepShared, labShareUrl, startLabPersistence } from '../../lab/persist.svelte.ts';
  import { NoToneMapping } from 'three';
  import { displayName, getSensor } from '../../data/index.ts';
  import { t } from '../../i18n/en.ts';
  import { formatMetres, formatShutter } from '../../lab/format.ts';
  import { initialTier } from '../../lab/render/tiers.ts';
  import { lab } from '../../lab/store.svelte.ts';
  import { url } from '../../lib/url.ts';
  import Meter from './Meter.svelte';
  import Plan from './Plan.svelte';
  import Scene from './Scene.svelte';
  import Stepper from './Stepper.svelte';
  import { APERTURES, SHUTTERS } from '../../lab/stops.ts';

  // The lab page (v2): desktop only. Layout "Studio plan" (owner, L2): the
  // picture with exposure under it on the left, a top view of the set on the right.
  const L = t.lab;
  const DESKTOP = '(min-width: 64rem)';

  let desktop = $state(typeof matchMedia === 'function' ? matchMedia(DESKTOP).matches : true);
  let webgl = $state<boolean | null>(null);
  let copied = $state(false);

  // Restore first (during setup), so the autosave below starts from the saved state and a visit that changes nothing writes nothing.
  const stopPersistence = startLabPersistence();
  onDestroy(stopPersistence);
  autosaveLab();
  let shareNote = $state('');

  async function share() {
    try {
      await navigator.clipboard.writeText(labShareUrl());
      shareNote = L.share.copied;
    } catch {
      shareNote = L.share.failed;
    }
    setTimeout(() => (shareNote = ''), 3000);
  }

  onMount(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl = !!gl;
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      lab.tier = initialTier(name);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    const mq = matchMedia(DESKTOP);
    const change = () => (desktop = mq.matches);
    mq.addEventListener('change', change);
    return () => {
      mq.removeEventListener('change', change);
    };
  });

  const sensor = $derived(getSensor(lab.setup.sensorId));
  const tag = $derived(`${sensor ? displayName(sensor) : ''} · ${lab.camera.aspect.toFixed(2)}:1 · ${lab.camera.focal} mm`);
  const done = $derived(lab.samples >= lab.target);
  // Cinema says T-stop, shutter angle and EI; Stills says f-stop, shutter speed and ISO.
  const apertureText = $derived(`${lab.cinema ? 'T' : 'f/'}${APERTURES[lab.apertureIndex]!.label}`);
  // In the stepper a fraction reads like a camera's display (1/50); whole seconds keep their unit.
  const shutterLabel = $derived(SHUTTERS[lab.shutterIndex]!.label);
  const shutterText = $derived(lab.cinema ? `${lab.angle}°` : shutterLabel.startsWith('1/') ? shutterLabel.replace(' s', '') : shutterLabel);
  const shutterSub = $derived(lab.cinema ? `${formatShutter(lab.shutter)} ${L.steps.at} ${lab.fps} fps` : undefined);
  const isoName = $derived(lab.cinema ? L.settings.ei : L.settings.iso);
  const focusText = $derived(formatMetres(lab.focusM));
  const pictureLabel = $derived(
    `${L.pictureLabel} ${lab.subject.name}, ${lab.lighting.name}, ${apertureText}, ${lab.cinema ? `${shutterText} (${shutterSub})` : shutterLabel}, ${isoName} ${lab.iso}, ${lab.kelvin} K, ${L.settings.focus.toLowerCase()} ${focusText}.`,
  );
  const side = (name: string, word: string, disabled: boolean, onclick: () => void) => ({ label: `${name}: ${word}`, disabled, onclick });

  // A dock tool open: the site bar keeps its dock open (src/lib/site-bar.ts).
  $effect(() => {
    document.body.dataset.panelOpen = String(desktop && lab.panel !== null);
  });

  function closePanel() {
    const was = lab.panel;
    lab.panel = null;
    window.dispatchEvent(new Event(PANEL_CLOSED_EVENT));
    if (was) tick().then(() => document.querySelector<HTMLElement>(`[aria-controls="lab-pane-${was}"]`)?.focus());
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !desktop || !lab.panel || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    closePanel();
  }

  const HW = 120;
  const HH = 40;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      copied = true;
      setTimeout(() => (copied = false), 2500);
    } catch {
      copied = false;
    }
  }
</script>

<svelte:window {onkeydown} />

{#if !desktop}
  <section class="card lab-phone" data-testid="lab-phone">
    <svg aria-hidden="true" viewBox="0 0 64 48" class="lab-phone-art"><rect x="6" y="4" width="52" height="34" rx="4" /><path d="M2 44h60" /><circle cx="32" cy="21" r="7" /><path d="M14 30l10-9 8 7 6-5 12 9" /></svg>
    <h2>{L.phone.title}</h2>
    <p>{L.phone.body}</p>
    <div class="lab-phone-actions">
      <button type="button" class="btn btn-primary" onclick={copyLink}>{copied ? L.phone.copied : L.phone.copy}</button>
      <a class="btn btn-secondary" href={url('viewfinder')}>{L.phone.viewfinder}</a>
    </div>
    <p class="sr-only" aria-live="polite">{copied ? L.phone.copied : ''}</p>
  </section>
{:else}
  <div class="lab-grid" data-testid="lab">
    <div class="lab-col">
      {#if lab.shared}
        <div class="note lab-shared" role="status" data-testid="lab-shared">
          <p><b>{L.sharedNote.title}</b> {L.sharedNote.body}{lab.shared.unknownCamera ? ` ${L.sharedNote.unknownCamera}` : ''}</p>
          <div class="lab-shared-actions">
            <button type="button" class="btn btn-primary" onclick={keepShared} data-testid="lab-shared-keep">{L.sharedNote.keep}</button>
            <button type="button" class="btn btn-secondary" onclick={backToMine} data-testid="lab-shared-back">{L.sharedNote.back}</button>
          </div>
        </div>
      {/if}
      <div class="lab-bar">
      <p class="lab-set">
        <span><small>{L.set}</small> {lab.set.name}</span>
        <span><small>{L.subject}</small> {lab.subject.name}</span>
        <span><small>{L.light}</small> {lab.lighting.name}</span>
      </p>
      <span class="lab-share">
        <span class="lab-share-note" role="status">{shareNote}</span>
        <button type="button" class="icon-btn" aria-label={L.share.label} title={L.share.label} onclick={share} data-testid="lab-share">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
        </button>
      </span>
      </div>

      <div class="lab-view" style:--aspect={lab.camera.aspect}>
        <div class="lab-stage" role="img" aria-label={pictureLabel} data-testid="lab-stage" data-samples={lab.samples} data-done={done}>
          {#if webgl}
            <Canvas renderMode="manual" autoRender={false} toneMapping={NoToneMapping} dpr={Math.min(devicePixelRatio || 1, 2)}>
              <Scene />
            </Canvas>
          {:else if webgl === false}
            <div class="lab-nogl"><b>{L.noWebgl[0]}</b><span>{L.noWebgl[1]}</span></div>
          {/if}
          <span class="vf-tag lab-tag" aria-hidden="true">{tag}</span>
          {#if lab.histogram && lab.hist}
            {@const h = lab.hist}
            <svg class="vf-hist" viewBox={`0 0 ${HW} ${HH}`} preserveAspectRatio="none" aria-hidden="true" data-testid="lab-hist">
              {#each [0.25, 0.5, 0.75] as f (f)}<line class="grid" x1={f * HW} x2={f * HW} y1="0" y2={HH} />{/each}
              {#if lab.histMode === 'luma'}
                <path class="luma" d={histogramPath(h.luma, HW, HH - 3, true)} transform="translate(0 3)" />
              {:else}
                <path class="ch r" d={histogramPath(h.r, HW, HH - 3, false)} transform="translate(0 3)" />
                <path class="ch g" d={histogramPath(h.g, HW, HH - 3, false)} transform="translate(0 3)" />
                <path class="ch b" d={histogramPath(h.b, HW, HH - 3, false)} transform="translate(0 3)" />
              {/if}
              {#if h.low > CLIP_SHARE}<rect class="clip" x="0" y="0" width="2.5" height={HH} />{/if}
              {#if h.high > CLIP_SHARE}<rect class="clip" x={HW - 2.5} y="0" width="2.5" height={HH} />{/if}
            </svg>
          {/if}
          <span class="lab-progress" aria-hidden="true">{done ? L.sharp : `${L.rendering} ${Math.round((lab.samples / lab.target) * 100)} %`}</span>
        </div>
      </div>

      <section class="card lab-strip" aria-label={L.exposure}>
        <div class="lab-strip-top">
          <Meter offset={lab.offset} ev={lab.sceneEv} />
          <div class="lab-strip-actions">
            <button type="button" class="btn btn-secondary" disabled={lab.sceneEv === null} onclick={() => lab.matchMeter()} data-testid="lab-match">{L.match}</button>
          </div>
        </div>
        <div class="lab-steps">
          <Stepper
            id="lab-aperture"
            label={L.settings.aperture}
            value={apertureText}
            less={side(L.settings.aperture, L.steps.less, !lab.canStep('aperture', -1), () => lab.stepAperture(-1))}
            more={side(L.settings.aperture, L.steps.more, !lab.canStep('aperture', 1), () => lab.stepAperture(1))}
          />
          <Stepper
            id="lab-shutter"
            label={L.settings.shutter}
            value={shutterText}
            sub={shutterSub}
            less={side(L.settings.shutter, L.steps.less, !lab.canStep('shutter', -1), () => lab.stepShutter(-1))}
            more={side(L.settings.shutter, L.steps.more, !lab.canStep('shutter', 1), () => lab.stepShutter(1))}
          />
          <Stepper
            id="lab-iso"
            label={isoName}
            value={String(lab.iso)}
            less={side(isoName, L.steps.less, !lab.canStep('iso', -1), () => lab.stepIso(-1))}
            more={side(isoName, L.steps.more, !lab.canStep('iso', 1), () => lab.stepIso(1))}
          />
          <Stepper
            id="lab-wb"
            label={L.settings.wb}
            value={`${lab.kelvin} K`}
            less={side(L.settings.wb, L.steps.wbLower, !lab.canStep('wb', -1), () => lab.stepWhiteBalance(-1))}
            more={side(L.settings.wb, L.steps.wbHigher, !lab.canStep('wb', 1), () => lab.stepWhiteBalance(1))}
          />
        </div>
        <p class="lab-note">{L.noiseNote}</p>
      </section>
    </div>

    {#if lab.panel}
      <LabPanes panel={lab.panel} onclose={closePanel} />
    {:else}
    <section class="card lab-plan-card" aria-labelledby="lab-plan-title">
      <header class="lab-pane-head"><h2 id="lab-plan-title">{L.plan.title}</h2><span>{L.plan.hint}</span></header>
      <Plan />
      <div class="lab-plan-focus">
        <Stepper
          id="lab-focus"
          label={L.settings.focus}
          value={focusText}
          sub={lab.focusManual === null ? L.onSubject : undefined}
          less={{ label: L.steps.closer, disabled: !lab.canStep('focus', -1), onclick: () => lab.stepFocus(-1) }}
          more={{ label: L.steps.farther, disabled: !lab.canStep('focus', 1), onclick: () => lab.stepFocus(1) }}
        />
        {#if lab.focusManual !== null}
          <button type="button" class="btn btn-secondary" onclick={() => lab.focusOnSubject()} data-testid="lab-focus-subject">{L.focusSubject}</button>
        {/if}
      </div>
    </section>
    {/if}
  </div>
{/if}
