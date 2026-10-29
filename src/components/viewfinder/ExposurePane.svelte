<script lang="ts">
  import { onMount } from 'svelte';
  import { live } from '../../camera/live.svelte.ts';
  import { aids, checkGpu, type PictureAid } from '../../analysis/aids.svelte.ts';
  import { BANDS, ZEBRA_LEVELS, bandRange, type PeakSensitivity } from '../../analysis/levels.ts';
  import { FRAME_COLORS } from '../../setup/presets.ts';
  import type { FrameColor } from '../../setup/types.ts';
  import { t } from '../../i18n/en.ts';

  const A = t.vf.aids;
  const pictures: [PictureAid, string][] = [
    ['off', A.pictureOff],
    ['zebras', A.zebras],
    ['falseColour', A.falseColour],
  ];
  const sens: PeakSensitivity[] = ['low', 'medium', 'high'];
  const colors = Object.keys(FRAME_COLORS) as FrameColor[];

  onMount(() => void checkGpu());

  // Exposure compensation: the slider moves at once, the camera follows a moment later.
  const range = $derived(live.caps.exposure);
  let ev = $state(0);
  $effect(() => {
    ev = live.ev;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  function setEv(v: number) {
    ev = v;
    clearTimeout(timer);
    timer = setTimeout(() => live.exposure(v), 120);
  }
  const evText = (v: number) => `${v > 0.04 ? '+' : v < -0.04 ? '−' : ''}${Math.abs(v).toFixed(1)} EV`;
</script>

<p class="vf-note">{live.showing ? A.note : A.sceneOnly}</p>

<label class="vf-row">
  <span class="vf-txt"><b>{A.histogram[0]}</b><span>{A.histogram[1]}</span></span>
  <input class="switch" type="checkbox" role="switch" bind:checked={aids.histogram} data-testid="aid-histogram" />
</label>
{#if aids.histogram}
  <div class="vf-row">
    <div class="vf-txt"><b>{A.histMode[0]}</b><span>{A.histMode[1]}</span></div>
    <div class="seg" role="group" aria-label={A.histMode[0]}>
      <button type="button" aria-pressed={aids.histMode === 'luma'} onclick={() => (aids.histMode = 'luma')}>{A.luma}</button>
      <button type="button" aria-pressed={aids.histMode === 'rgb'} onclick={() => (aids.histMode = 'rgb')}>{A.rgb}</button>
    </div>
  </div>
{/if}

{#if aids.gpu === false}
  <p class="vf-row text-sm text-muted">{A.noGpu}</p>
{:else}
  <div class="vf-row stack">
    <div class="vf-txt"><b>{A.picture[0]}</b><span>{A.picture[1]}</span></div>
    <div class="seg self-start" role="group" aria-label={A.picture[0]}>
      {#each pictures as [id, label]}
        <button type="button" aria-pressed={aids.picture === id} onclick={() => (aids.picture = id)} data-testid={`aid-${id}`}>{label}</button>
      {/each}
    </div>
    {#if aids.picture === 'zebras'}
      <div class="chips" role="group" aria-label={A.zebraLevel}>
        {#each ZEBRA_LEVELS as z}
          <button type="button" class="chip mono" aria-pressed={aids.zebra === z} onclick={() => (aids.zebra = z)}>{z} %</button>
        {/each}
      </div>
      <span class="text-ui text-muted">{A.zebraLevel} {aids.zebra} %</span>
    {:else if aids.picture === 'falseColour'}
      <div class="vf-legend" data-testid="aid-legend">
        {#each BANDS as b}<i style={`background:${b.color}`}></i><span>{A.bands[b.id]}</span><span class="vf-num">{bandRange(b)}</span>{/each}
        <i style="background: linear-gradient(90deg, #333, #ccc)"></i><span>{A.otherBands}</span><span class="vf-num">{A.otherShown}</span>
      </div>
      <span class="text-ui text-muted">{A.bandsNote}</span>
    {/if}
  </div>

  <label class="vf-row">
    <span class="vf-txt"><b>{A.peaking[0]}</b><span>{A.peaking[1]}</span></span>
    <input class="switch" type="checkbox" role="switch" bind:checked={aids.peaking} data-testid="aid-peaking" />
  </label>
  {#if aids.peaking}
    <div class="vf-row">
      <div class="vf-txt"><b>{A.peakColor}</b></div>
      <div class="swatches" role="group" aria-label={A.peakColor}>
        {#each colors as c}
          <button type="button" class="swatch" style={`background:${FRAME_COLORS[c]}`} aria-label={t.vf.guides.colors[c]} aria-pressed={aids.peakColor === c} onclick={() => (aids.peakColor = c)}></button>
        {/each}
      </div>
    </div>
    <div class="vf-row">
      <div class="vf-txt"><b>{A.peakSens[0]}</b><span>{A.peakSens[1]}</span></div>
      <div class="seg" role="group" aria-label={A.peakSens[0]}>
        {#each sens as s}<button type="button" aria-pressed={aids.peakSens === s} onclick={() => (aids.peakSens = s)}>{A[s]}</button>{/each}
      </div>
    </div>
  {/if}
{/if}

{#if live.showing}
  <div class="vf-row stack">
    <div class="flex items-baseline justify-between gap-3">
      <div class="vf-txt"><b>{A.ev[0]}</b><span>{range ? A.ev[1] : A.noEv}</span></div>
      {#if range}<span class="vf-num shrink-0 text-lg font-semibold whitespace-nowrap" data-testid="aid-ev">{evText(ev)}</span>{/if}
    </div>
    {#if range}
      <input class="slider" type="range" min={range.min} max={range.max} step={range.step ?? 0.1} value={ev} aria-label={A.evLabel} aria-valuetext={evText(ev)} oninput={(e) => setEv(Number(e.currentTarget.value))} />
      <div class="scale-labels"><span>{range.min}</span><span>0</span><span>+{range.max}</span></div>
    {/if}
  </div>
{/if}
