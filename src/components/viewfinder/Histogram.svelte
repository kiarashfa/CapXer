<script lang="ts">
  import { aids } from '../../analysis/aids.svelte.ts';
  import { CLIP_SHARE, histogramPath } from '../../analysis/levels.ts';

  // The histogram inset in the corner of the picture (like a camera monitor).
  // Drawn in a fixed viewBox and stretched; strokes keep their width.
  const W = 120;
  const H = 40;
  const h = $derived(aids.hist);
</script>

{#if h}
  <svg class="vf-hist" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" data-testid="vf-hist">
    {#each [0.25, 0.5, 0.75] as f}<line class="grid" x1={f * W} x2={f * W} y1="0" y2={H} />{/each}
    {#if aids.histMode === 'luma'}
      <path class="luma" d={histogramPath(h.luma, W, H - 3, true)} transform="translate(0 3)" />
    {:else}
      <path class="ch r" d={histogramPath(h.r, W, H - 3, false)} transform="translate(0 3)" />
      <path class="ch g" d={histogramPath(h.g, W, H - 3, false)} transform="translate(0 3)" />
      <path class="ch b" d={histogramPath(h.b, W, H - 3, false)} transform="translate(0 3)" />
    {/if}
    {#if h.low > CLIP_SHARE}<rect class="clip" x="0" y="0" width="2.5" height={H} data-testid="clip-low" />{/if}
    {#if h.high > CLIP_SHARE}<rect class="clip" x={W - 2.5} y="0" width="2.5" height={H} data-testid="clip-high" />{/if}
  </svg>
{/if}
