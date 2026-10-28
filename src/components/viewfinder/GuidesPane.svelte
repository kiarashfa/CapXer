<script lang="ts">
  import { vf } from '../../setup/store.svelte.ts';
  import { FRAME_COLORS } from '../../setup/presets.ts';
  import type { FrameColor, Guides } from '../../setup/types.ts';
  import { t } from '../../i18n/en.ts';

  const toggles: (keyof Guides)[] = ['thirds', 'golden', 'centre', 'safe'];
  const colors = Object.keys(FRAME_COLORS) as FrameColor[];
</script>

{#each toggles as g}
  <label class="vf-row">
    <span class="vf-txt"><b>{t.vf.guides[g][0]}</b><span>{t.vf.guides[g][1]}</span></span>
    <input class="switch" type="checkbox" role="switch" bind:checked={vf.setup.guides[g]} />
  </label>
{/each}

<div class="vf-row">
  <div class="vf-txt"><b>{t.vf.guides.color[0]}</b><span>{t.vf.guides.color[1]}</span></div>
  <div class="swatches" role="group" aria-label={t.vf.guides.color[0]}>
    {#each colors as c}
      <button type="button" class="swatch" style={`background:${FRAME_COLORS[c]}`} aria-label={t.vf.guides.colors[c]} aria-pressed={vf.setup.frameColor === c} onclick={() => (vf.setup.frameColor = c)}></button>
    {/each}
  </div>
</div>

<label class="vf-row">
  <span class="vf-txt"><b>{t.vf.guides.mask[0]}</b><span>{t.vf.guides.mask[1]}</span></span>
  <input class="slider" style="max-width: 180px" type="range" min="0" max="0.9" step="0.05" bind:value={vf.setup.mask} />
</label>
