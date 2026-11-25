<script lang="ts">
  import { t } from '../../i18n/en.ts';

  // Exposure meter: a scale from -3 to +3 stops with a needle at the offset
  // between the settings and what the meter reads for the scene.
  let { offset, ev }: { offset: number | null; ev: number | null } = $props();
  const L = t.lab.meter;
  const ticks = [-3, -2, -1, 0, 1, 2, 3];
  const at = (stops: number) => ((Math.max(-3.4, Math.min(3.4, stops)) + 3) / 6) * 100;
  const verdict = $derived(
    offset === null
      ? L.measuring
      : Math.abs(offset) < 0.05
        ? L.on
        : `${Math.abs(offset).toFixed(1)} ${offset > 0 ? L.brighter : L.darker}`,
  );
</script>

<div
  class="lab-meter"
  role="img"
  aria-label={`${L.label}: ${verdict}${ev === null ? '' : `, EV ${ev.toFixed(1)}`}`}
>
  <div class="lab-meter-scale" aria-hidden="true">
    {#each ticks as n (n)}
      <span class="tick" class:zero={n === 0} style:left="{at(n)}%"
        ><i></i><b>{n > 0 ? `+${n}` : n === 0 ? '0' : `−${-n}`}</b></span
      >
    {/each}
    {#if offset !== null}
      <span
        class="band"
        style:left="{Math.min(50, at(offset))}%"
        style:width="{Math.abs(at(offset) - 50)}%"
      ></span>
      <span class="needle" style:left="{at(offset)}%"></span>
    {/if}
  </div>
  <p class="lab-meter-read" aria-hidden="true">
    <span>{L.label} <b class="vf-num">{ev === null ? '...' : `EV ${ev.toFixed(1)}`}</b></span>
    <span class="lab-off" class:on={offset !== null && Math.abs(offset) < 0.05}>{verdict}</span>
  </p>
</div>
