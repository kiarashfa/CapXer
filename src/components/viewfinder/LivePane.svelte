<script lang="ts">
  import { onMount } from 'svelte';
  import { live } from '../../camera/live.svelte.ts';
  import { equivalentOf } from '../../camera/lens.ts';
  import { getDevice, displayName } from '../../data/index.ts';
  import { t } from '../../i18n/en.ts';

  let { onpick }: { onpick: () => void } = $props();

  const L = t.vf.live;
  const device = $derived(live.effective.kind === 'device' ? getDevice(live.effective.deviceId) : undefined);
  const cameraId = $derived(live.effective.kind === 'device' ? live.effective.cameraId : '');
  const eq = $derived(equivalentOf(live.fov));
  const wide = $derived((2 * Math.atan(live.fov.longTan) * 180) / Math.PI);
  const help = $derived(live.plan ? L.modeHelp[live.plan.mode] : '');

  let unit = $state<'mm' | 'deg'>('mm');
  let value = $state('');
  let levelProblem = $state(false);
  let hasMotion = $state(false);
  onMount(() => (hasMotion = 'DeviceOrientationEvent' in window));

  function applyManual(e: SubmitEvent) {
    e.preventDefault();
    const v = Number.parseFloat(value.replace(',', '.'));
    if (unit === 'mm' && v >= 5 && v <= 300) live.calibration = { kind: 'equivalent', mm: v };
    else if (unit === 'deg' && v > 5 && v < 175) live.calibration = { kind: 'diagonal', degrees: v };
    else return;
    value = '';
  }

  // iOS asks for motion access on a tap; other browsers simply deliver events.
  async function toggleLevel(on: boolean) {
    levelProblem = false;
    if (on) {
      const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
      if (ask) {
        try {
          if ((await ask()) !== 'granted') {
            levelProblem = true;
            return;
          }
        } catch {
          levelProblem = true;
          return;
        }
      }
    }
    live.level = on;
  }
</script>

<div class="vf-row">
  <div class="vf-txt"><b>{L.source}</b><span>{L.sourceHint}</span></div>
  <div class="seg" role="group" aria-label={L.source}>
    <button type="button" aria-pressed={live.source === 'scene'} onclick={() => live.stop()} data-testid="pane-source-scene">{L.scene}</button>
    <button type="button" aria-pressed={live.source === 'live'} onclick={() => live.begin()} data-testid="pane-source-live">{L.live}</button>
  </div>
</div>

{#if live.showing && live.cameras.length > 1}
  <div class="vf-row">
    <label class="vf-txt" for="vf-live-camera"><b>{L.cameraSelect[0]}</b><span>{L.cameraSelect[1]}</span></label>
    <select id="vf-live-camera" class="select" style="max-width: 55%" value={live.deviceId} onchange={(e) => live.start(e.currentTarget.value)}>
      {#each live.cameras as c}<option value={c.deviceId}>{c.label}</option>{/each}
    </select>
  </div>
{/if}

<div class="vf-row stack">
  <div class="vf-txt"><b>{L.device[0]}</b><span>{live.calibration ? L.device[1] : L.assumed}</span></div>
  <button type="button" class="picker-btn" onclick={onpick} data-testid="device-picker">
    <span>{device ? displayName(device) : live.effective.kind === 'equivalent' ? `${live.effective.mm} mm` : `${live.effective.kind === 'diagonal' ? live.effective.degrees : ''}°`}</span>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"></circle><path d="m20 20-4.5-4.5"></path></svg>
  </button>
  {#if device && device.cameras.length > 1}
    <div class="chips" role="group" aria-label={L.lens}>
      {#each device.cameras as c}
        <button type="button" class="chip" aria-pressed={c.id === cameraId} onclick={() => (live.calibration = { kind: 'device', deviceId: device.id, cameraId: c.id })}>{c.name}</button>
      {/each}
    </div>
  {/if}
</div>

<div class="vf-row stack">
  <div class="vf-txt"><b>{L.manual[0]}</b><span>{L.manual[1]}</span></div>
  <form class="flex flex-wrap items-center gap-2" onsubmit={applyManual}>
    <div class="seg" role="group" aria-label={L.manual[0]}>
      <button type="button" aria-pressed={unit === 'mm'} onclick={() => (unit = 'mm')}>{L.manualMm}</button>
      <button type="button" aria-pressed={unit === 'deg'} onclick={() => (unit = 'deg')}>{L.manualDeg}</button>
    </div>
    <div class="flex items-center gap-2">
      <input class="field-input num" style="width: 5em" inputmode="decimal" aria-label={`${L.manualLabel} (${unit === 'mm' ? L.manualMm : L.manualDeg})`} bind:value data-testid="calibration-input" />
      <button type="submit" class="btn btn-secondary">{L.apply}</button>
    </div>
  </form>
</div>

<div class="vf-row">
  <div class="vf-txt"><b>{L.result}</b><span>{L.approx}</span></div>
  <span class="vf-num shrink-0 text-right whitespace-nowrap" data-testid="calibration-result">{eq.toFixed(1)} mm<br /><small class="text-muted">{wide.toFixed(1)}° {L.across}</small></span>
</div>

{#if live.showing}
  <div class="vf-row stack">
    <div class="vf-txt"><b data-testid="live-mode">{live.modeLabel}</b><span>{help}</span></div>
    <span class="text-sm text-muted vf-num">
      {live.caps.zoom ? `${L.zoomRange}: ${live.caps.zoom.min}x to ${live.caps.zoom.max}x` : L.noZoom}
    </span>
  </div>
{/if}

{#if hasMotion}
  <label class="vf-row">
    <span class="vf-txt"><b>{L.level[0]}</b><span>{levelProblem ? L.levelDenied : L.level[1]}</span></span>
    <input class="switch" type="checkbox" role="switch" checked={live.level} onchange={(e) => toggleLevel(e.currentTarget.checked)} />
  </label>
{/if}
