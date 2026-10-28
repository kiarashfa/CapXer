<script lang="ts">
  import { vf } from '../../setup/store.svelte.ts';
  import { SQUEEZES } from '../../setup/presets.ts';
  import { t } from '../../i18n/en.ts';

  let { onpick }: { onpick: () => void } = $props();

  let adding = $state(false);
  let name = $state('');
  let width = $state('');
  let height = $state('');
  let squeeze = $state(1);
  const w = $derived(Number.parseFloat(width.replace(',', '.')));
  const h = $derived(Number.parseFloat(height.replace(',', '.')));
  const valid = $derived(w >= 1 && w <= 100 && h >= 1 && h <= 100);

  function addCustom(e: SubmitEvent) {
    e.preventDefault();
    if (!valid) return;
    vf.addCustomSensor({ name: name.trim() || t.vf.custom.defaultName, width: w, height: h, squeeze });
    adding = false;
    name = width = height = '';
    squeeze = 1;
  }
</script>

<div class="vf-row">
  <div class="vf-txt"><b>{t.vf.mode.label}</b><span>{t.vf.mode.hint}</span></div>
  <div class="seg" role="group" aria-label={t.vf.mode.label}>
    <button type="button" aria-pressed={vf.setup.mode === 'cinema'} onclick={() => vf.setMode('cinema')}>{t.vf.mode.cinema}</button>
    <button type="button" aria-pressed={vf.setup.mode === 'stills'} onclick={() => vf.setMode('stills')}>{t.vf.mode.stills}</button>
  </div>
</div>

<div class="vf-row stack">
  <div class="vf-txt"><b>{t.vf.camera.label}</b><span>{t.vf.camera.hint}</span></div>
  <button type="button" class="picker-btn" onclick={onpick} data-testid="camera-picker">
    <span>{vf.camera.name}</span>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"></circle><path d="m20 20-4.5-4.5"></path></svg>
  </button>
</div>

{#if vf.camera.formats.length > 1}
  <div class="vf-row">
    <label class="vf-txt" for="vf-format">
      <b>{vf.setup.mode === 'cinema' ? t.vf.camera.format : t.vf.camera.formatStills}</b>
      <span class="vf-num">{vf.format.width} x {vf.format.height} mm</span>
    </label>
    <select id="vf-format" class="select" value={vf.setup.formatId} onchange={(e) => vf.setFormat(e.currentTarget.value)}>
      {#each vf.camera.formats as f}<option value={f.id}>{f.name}</option>{/each}
    </select>
  </div>
{/if}

<div class="vf-row stack">
  <div class="flex items-center justify-between gap-4">
    <div class="vf-txt"><b>{t.vf.custom.label}</b><span>{t.vf.custom.hint}</span></div>
    {#if !adding}<button type="button" class="btn btn-secondary" onclick={() => (adding = true)}>{t.vf.custom.add}</button>{/if}
  </div>
  {#if adding}
    <form class="grid grid-cols-2 gap-3" onsubmit={addCustom}>
      <label class="col-span-2 grid gap-1 text-sm">{t.vf.custom.name}<input class="field-input" bind:value={name} placeholder={t.vf.custom.defaultName} /></label>
      <label class="grid gap-1 text-sm">{t.vf.custom.width}<input class="field-input num" inputmode="decimal" required bind:value={width} /></label>
      <label class="grid gap-1 text-sm">{t.vf.custom.height}<input class="field-input num" inputmode="decimal" required bind:value={height} /></label>
      <label class="col-span-2 grid gap-1 text-sm">{t.vf.custom.squeeze}
        <select class="select" bind:value={squeeze}>{#each SQUEEZES as s}<option value={s}>{s === 1 ? t.vf.frame.spherical : `${s}x`}</option>{/each}</select>
      </label>
      <button type="submit" class="btn btn-primary col-span-2" disabled={!valid}>{t.vf.custom.submit}</button>
    </form>
  {/if}
</div>
