<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { vf } from '../../setup/store.svelte.ts';
  import { live } from '../../camera/live.svelte.ts';
  import { levelRoll } from '../../camera/lens.ts';
  import { aids } from '../../analysis/aids.svelte.ts';
  import { toEntry } from '../../setup/focal.ts';
  import { aspectText } from '../../setup/presets.ts';
  import type { PanelId } from '../../setup/types.ts';
  import { SCENE_CAPTION } from '../../overlay/scene.ts';
  import { PANEL_CLOSED_EVENT } from '../../lib/site-bar.ts';
  import { t } from '../../i18n/en.ts';
  import Stage from './Stage.svelte';
  import CameraPane from './CameraPane.svelte';
  import FramePane from './FramePane.svelte';
  import LensPane from './LensPane.svelte';
  import GuidesPane from './GuidesPane.svelte';
  import LivePane from './LivePane.svelte';
  import ExposurePane from './ExposurePane.svelte';
  import InfoPane from './InfoPane.svelte';
  import CameraPicker from './CameraPicker.svelte';
  import DevicePicker from './DevicePicker.svelte';

  // One set of panes, two presentations: tabs below the pinned viewfinder on
  // phone/tablet, floating panels opened from the site bar's dock on desktop.
  const panels: PanelId[] = ['camera', 'frame', 'lens', 'guides', 'live', 'exposure', 'info'];
  let desktop = $state(false);
  let picker = $state<ReturnType<typeof CameraPicker>>();
  let devicePicker = $state<ReturnType<typeof DevicePicker>>();
  let top = $state<HTMLElement>();
  let fullBtn = $state<HTMLButtonElement>();
  let photoMsg = $state('');
  let aidsOpen = $state(false);

  const d = $derived(vf.derived);
  const deg = (n: number) => `${n.toFixed(1)}°`;
  const focalShown = $derived(toEntry(vf.setup.focal, vf.setup.focalEntry, d.crop));
  const ff = $derived(vf.setup.focalEntry === 'equivalent' ? ' FF' : '');

  onMount(() => {
    const mq = matchMedia('(min-width: 64rem)');
    const apply = () => {
      desktop = mq.matches;
      if (desktop) vf.panel = null;
      else if (!vf.panel) vf.panel = 'lens';
    };
    apply();
    mq.addEventListener('change', apply);
    live.phone = matchMedia('(pointer: coarse)').matches;

    // The camera is released whenever the page is not visible.
    const onvis = () => (document.hidden ? live.pause() : live.resume());
    const onhide = () => live.pause();
    const onfs = () => {
      if (!document.fullscreenElement && live.fullView) closeFull();
    };
    document.addEventListener('visibilitychange', onvis);
    window.addEventListener('pagehide', onhide);
    document.addEventListener('fullscreenchange', onfs);
    return () => {
      mq.removeEventListener('change', apply);
      document.removeEventListener('visibilitychange', onvis);
      window.removeEventListener('pagehide', onhide);
      document.removeEventListener('fullscreenchange', onfs);
      live.stop();
    };
  });

  // The site bar keeps its dock open while a desktop panel is open.
  $effect(() => {
    document.body.dataset.panelOpen = String(desktop && vf.panel !== null);
  });

  // Level: device orientation while the switch is on.
  $effect(() => {
    if (!live.level) return;
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const r = levelRoll(e.beta, e.gamma, screen.orientation?.angle ?? 0);
      live.roll = r.roll;
      live.rollValid = r.valid;
    };
    window.addEventListener('deviceorientation', on);
    return () => {
      window.removeEventListener('deviceorientation', on);
      live.rollValid = false;
    };
  });

  function closePanel() {
    const was = vf.panel;
    vf.panel = null;
    window.dispatchEvent(new Event(PANEL_CLOSED_EVENT));
    if (was) tick().then(() => document.querySelector<HTMLElement>(`[aria-controls="vf-pane-${was}"]`)?.focus());
  }

  // Full view: real fullscreen and a landscape lock where the browser allows
  // them (Android); otherwise a fixed layer over the page (iPhone).
  async function openFull() {
    live.fullView = true;
    vf.panel = desktop ? null : vf.panel;
    try {
      await top?.requestFullscreen?.({ navigationUI: 'hide' });
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      // Not allowed here: the fixed layer is enough.
    }
    await tick();
    top?.querySelector<HTMLElement>('.vf-full-close')?.focus();
  }

  function closeFull() {
    live.fullView = false;
    aidsOpen = false;
    try {
      screen.orientation?.unlock?.();
    } catch {
      // Nothing was locked.
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    tick().then(() => fullBtn?.focus());
  }

  async function shoot() {
    photoMsg = '';
    const r = await live.photo();
    photoMsg = r === 'downloaded' ? t.vf.live.photo.downloaded : r === 'failed' ? t.vf.live.photo.failed : '';
    if (photoMsg) setTimeout(() => (photoMsg = ''), 4000);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (live.fullView) {
      e.preventDefault();
      if (aidsOpen) {
        aidsOpen = false;
        top?.querySelector<HTMLElement>('.vf-full-aids')?.focus();
      } else closeFull();
      return;
    }
    if (!desktop || !vf.panel) return;
    e.preventDefault();
    closePanel();
  }

  function onTabKey(e: KeyboardEvent, i: number) {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
    if (next < 0 && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const id = panels[(next + panels.length) % panels.length]!;
    vf.panel = id;
    document.getElementById(`vf-tab-${id}`)?.focus();
  }
</script>

<svelte:window {onkeydown} />

{#snippet shutter(cls: string)}
  <button type="button" class={cls} aria-label={t.vf.live.capture} onclick={shoot} data-testid="vf-capture">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>
  </button>
{/snippet}

<div class="vf-page" class:full={live.fullView} style={`--aspect:${d.areaAspect}`}>
  <div class="vf-top" bind:this={top}>
    <div class="vf-bar">
      <div class="seg" role="group" aria-label={t.vf.live.source}>
        <button type="button" aria-pressed={live.source === 'scene'} onclick={() => live.stop()}>{t.vf.live.scene}</button>
        <button type="button" aria-pressed={live.source === 'live'} onclick={() => live.begin()} data-testid="vf-live">{t.vf.live.live}</button>
      </div>
      <span class="vf-bar-msg" role="status">{photoMsg}</span>
      {#if live.showing}
        {@render shutter('icon-btn vf-bar-btn')}
        <button type="button" class="btn btn-secondary vf-bar-full" bind:this={fullBtn} onclick={openFull}>
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"></path></svg>
          {t.vf.live.fullView}
        </button>
      {/if}
    </div>
    <Stage />
    {#if live.fullView}
      <div class="vf-full-ui">
        <button type="button" class="icon-btn vf-full-close" aria-label={t.vf.live.closeFullView} onclick={closeFull}>
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
        <div class="vf-full-focal">
          <button type="button" class="icon-btn" aria-label={t.vf.lens.shorter} onclick={() => vf.step(-1)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12"></path></svg>
          </button>
          <span class="vf-num" aria-live="polite">{focalShown}<small> mm{ff}</small></span>
          <button type="button" class="icon-btn" aria-label={t.vf.lens.longer} onclick={() => vf.step(1)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12M12 6v12"></path></svg>
          </button>
        </div>
        <span class="vf-full-read vf-num"><span>{t.vf.readout.horizontal} {deg(d.fov.horizontal)}</span><span>{t.vf.readout.vertical} {deg(d.fov.vertical)}</span></span>
        {@render shutter('vf-shutter')}
        <button type="button" class="icon-btn vf-full-aids" aria-label={t.vf.aids.open} aria-expanded={aidsOpen} aria-controls="vf-full-aids-menu" onclick={() => (aidsOpen = !aidsOpen)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8"></circle><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"></path></svg>
        </button>
        {#if aidsOpen}
          <div class="vf-full-menu" id="vf-full-aids-menu" role="group" aria-label={t.vf.aids.open}>
            <button type="button" class="chip" aria-pressed={aids.histogram} onclick={() => (aids.histogram = !aids.histogram)}>{t.vf.aids.histogram[0]}</button>
            {#if aids.gpu !== false}
              <button type="button" class="chip" aria-pressed={aids.picture === 'zebras'} onclick={() => (aids.picture = aids.picture === 'zebras' ? 'off' : 'zebras')}>{t.vf.aids.zebras} {aids.zebra} %</button>
              <button type="button" class="chip" aria-pressed={aids.picture === 'falseColour'} onclick={() => (aids.picture = aids.picture === 'falseColour' ? 'off' : 'falseColour')}>{t.vf.aids.falseColour}</button>
              <button type="button" class="chip" aria-pressed={aids.peaking} onclick={() => (aids.peaking = !aids.peaking)}>{t.vf.aids.peakingShort}</button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    <div class="vf-inst" aria-live="polite">
      <div class="vf-big">{focalShown}<small> mm{ff}</small></div>
      <div class="vf-mini vf-num">
        <span class="ctx">{vf.camera.name} · {vf.format.name}</span>
        <span>{t.vf.readout.horizontal} <b>{deg(d.fov.horizontal)}</b></span>
        <span>{t.vf.readout.vertical} <b>{deg(d.fov.vertical)}</b></span>
        <span>{t.vf.readout.likeFF} <b>{Math.round(d.equivalent)} mm</b></span>
      </div>
    </div>
    <p class="vf-hud vf-num" aria-live="polite" data-testid="vf-hud">
      <span>{vf.camera.name} · {vf.format.name} · {aspectText(vf.setup.mode, vf.setup.aspect)}</span>
      <span>{t.vf.readout.horizontal} <b>{deg(d.fov.horizontal)}</b></span>
      <span>{t.vf.readout.vertical} <b>{deg(d.fov.vertical)}</b></span>
      <span>{t.vf.readout.diagonal} <b>{deg(d.fov.diagonal)}</b></span>
      <span>{t.vf.readout.crop} <b>x{d.crop.toFixed(2)}</b></span>
      <span>{t.vf.readout.likeFF} <b>{Math.round(d.equivalent)} mm</b></span>
    </p>
    {#if !live.showing}<p class="vf-caption">{SCENE_CAPTION}</p>{/if}
  </div>

  <div class="vf-tabs" role="tablist" aria-label={t.vf.tools}>
    {#each panels as p, i}
      <button
        type="button"
        role="tab"
        id={`vf-tab-${p}`}
        aria-selected={vf.panel === p}
        aria-controls={`vf-pane-${p}`}
        tabindex={vf.panel === p ? 0 : -1}
        onclick={() => (vf.panel = p)}
        onkeydown={(e) => onTabKey(e, i)}>{t.vf.panels[p]}</button
      >
    {/each}
  </div>

  {#each panels as p}
    <section
      id={`vf-pane-${p}`}
      class="vf-pane"
      role={desktop ? 'dialog' : 'tabpanel'}
      aria-labelledby={desktop ? `vf-pane-${p}-title` : `vf-tab-${p}`}
      hidden={vf.panel !== p}
      data-testid={`pane-${p}`}
    >
      <div class="vf-pane-head">
        <h2 id={`vf-pane-${p}-title`}>{t.vf.panels[p]}</h2>
        <button type="button" class="icon-btn" aria-label={t.vf.close} onclick={closePanel}>
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      {#if p === 'camera'}<CameraPane onpick={() => picker?.open()} />
      {:else if p === 'frame'}<FramePane />
      {:else if p === 'lens'}<LensPane />
      {:else if p === 'guides'}<GuidesPane />
      {:else if p === 'live'}<LivePane onpick={() => devicePicker?.open()} />
      {:else if p === 'exposure'}<ExposurePane />
      {:else}<InfoPane />{/if}
    </section>
  {/each}

  <CameraPicker bind:this={picker} />
  <DevicePicker bind:this={devicePicker} />
</div>
