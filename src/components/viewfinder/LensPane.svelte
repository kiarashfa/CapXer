<script lang="ts">
  import { vf } from '../../setup/store.svelte.ts';
  import { SLIDER_STEPS, fromEntry, fromSlider, toEntry, toSlider } from '../../setup/focal.ts';
  import { t } from '../../i18n/en.ts';

  const crop = $derived(vf.derived.crop);
  const entry = $derived(vf.setup.focalEntry);
  const shown = $derived(toEntry(vf.setup.focal, entry, crop));
  // Round values placed at their true positions on the logarithmic slider,
  // thinned so labels never crowd each other.
  const NICE = [1, 2, 3, 4, 6, 8, 12, 18, 24, 35, 50, 85, 135, 200, 300, 500, 800, 1200];
  const ticks = $derived.by(() => {
    const out: { label: number; pos: number }[] = [];
    for (const label of NICE) {
      const pos = toSlider(fromEntry(label, entry, crop), vf.range) / SLIDER_STEPS;
      const actual = fromEntry(label, entry, crop);
      if (actual < vf.range.min || actual > vf.range.max) continue;
      if (out.length && pos - out.at(-1)!.pos < 0.14) continue;
      out.push({ label, pos });
    }
    return out;
  });
  let newLens = $state('');

  function addLens(e: SubmitEvent) {
    e.preventDefault();
    const v = Number.parseFloat(newLens.replace(',', '.'));
    if (v > 0 && v <= 2000) vf.addLens(Math.round(v * 10) / 10);
    newLens = '';
  }
</script>

<div class="vf-row">
  <div class="vf-txt"><b>{t.vf.lens.entry}</b><span>{t.vf.lens.entryHint}</span></div>
  <div class="seg" role="group" aria-label={t.vf.lens.entry}>
    <button type="button" aria-pressed={entry === 'actual'} onclick={() => vf.setEntry('actual')}>{t.vf.lens.actual}</button>
    <button type="button" aria-pressed={entry === 'equivalent'} onclick={() => vf.setEntry('equivalent')}>{t.vf.lens.equivalent}</button>
  </div>
</div>

<div class="vf-row stack">
  <div class="flex items-baseline justify-between gap-4">
    <label class="vf-txt" for="vf-focal"><b>{t.vf.lens.label}</b><span>{t.vf.lens.sliderHint}</span></label>
    <span class="vf-num text-2xl font-semibold text-accent">{shown}<small class="text-sm text-muted"> mm{entry === 'equivalent' ? ' FF' : ''}</small></span>
  </div>
  <div>
    <input
      id="vf-focal"
      class="slider"
      type="range"
      min="0"
      max={SLIDER_STEPS}
      value={toSlider(vf.setup.focal, vf.range)}
      aria-valuetext={`${shown} mm${entry === 'equivalent' ? ' full-frame equivalent' : ''}`}
      oninput={(e) => vf.setFocal(fromSlider(Number(e.currentTarget.value), vf.range))}
    />
    <div class="scale-labels relative h-4" aria-hidden="true">
      {#each ticks as tk}<span class="absolute -translate-x-1/2" style={`left: calc(14px + (100% - 28px) * ${tk.pos})`}>{tk.label}</span>{/each}
    </div>
  </div>
</div>

<div class="vf-row stack">
  <div class="vf-txt"><b>{t.vf.lens.stops}</b><span>{t.vf.lens.stopsHint}</span></div>
  <div class="chips" role="group" aria-label={t.vf.lens.stops}>
    {#each vf.stopLabels as s, i}
      <button type="button" class="chip mono" aria-pressed={Math.abs(vf.stopsActual[i]! - vf.setup.focal) < 0.05} onclick={() => vf.setFocal(vf.stopsActual[i]!)}>{s}</button>
    {/each}
  </div>
  <form class="flex items-center gap-2" onsubmit={addLens}>
    <label class="text-sm text-muted" for="vf-new-lens">{t.vf.lens.addLens}</label>
    <input id="vf-new-lens" class="field-input num" inputmode="decimal" bind:value={newLens} />
    <button type="submit" class="btn btn-secondary">{t.vf.custom.add}</button>
  </form>
</div>
