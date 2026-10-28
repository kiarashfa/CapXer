<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { vf } from '../../setup/store.svelte.ts';
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
  import InfoPane from './InfoPane.svelte';
  import CameraPicker from './CameraPicker.svelte';

  // One set of panes, two presentations: tabs below the pinned viewfinder on
  // phone/tablet, floating panels opened from the site bar's dock on desktop.
  const panels: PanelId[] = ['camera', 'frame', 'lens', 'guides', 'info'];
  let desktop = $state(false);
  let picker = $state<ReturnType<typeof CameraPicker>>();

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
    return () => mq.removeEventListener('change', apply);
  });

  // The site bar keeps its dock open while a desktop panel is open.
  $effect(() => {
    document.body.dataset.panelOpen = String(desktop && vf.panel !== null);
  });

  function closePanel() {
    const was = vf.panel;
    vf.panel = null;
    window.dispatchEvent(new Event(PANEL_CLOSED_EVENT));
    if (was) tick().then(() => document.querySelector<HTMLElement>(`[aria-controls="vf-pane-${was}"]`)?.focus());
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !desktop || !vf.panel || document.querySelector('dialog[open]')) return;
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

<div class="vf-page" style={`--aspect:${d.areaAspect}`}>
  <div class="vf-top">
    <Stage />
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
    <p class="vf-caption">{SCENE_CAPTION}</p>
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
      {:else}<InfoPane />{/if}
    </section>
  {/each}

  <CameraPicker bind:this={picker} />
</div>
