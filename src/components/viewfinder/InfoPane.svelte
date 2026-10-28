<script lang="ts">
  import { vf } from '../../setup/store.svelte.ts';
  import { t } from '../../i18n/en.ts';

  const d = $derived(vf.derived);
  const deg = (n: number) => `${n.toFixed(1)}°`;
</script>

<div class="vf-row">
  <div class="vf-txt"><b>{t.vf.info.angle[0]}</b><span>{t.vf.info.angle[1]}</span></div>
  <span class="vf-num" data-testid="info-angles">{deg(d.fov.horizontal)} · {deg(d.fov.vertical)} · {deg(d.fov.diagonal)}</span>
</div>
<div class="vf-row">
  <div class="vf-txt"><b>{t.vf.info.crop[0]}</b><span>{t.vf.info.crop[1]}</span></div>
  <span class="vf-num">x{d.crop.toFixed(2)}</span>
</div>
<div class="vf-row">
  <div class="vf-txt"><b>{t.vf.info.equivalent[0]}</b><span>{t.vf.info.equivalent[1]}</span></div>
  <span class="vf-num">{Math.round(d.equivalent)} mm</span>
</div>
<div class="vf-row">
  <div class="vf-txt">
    <b>{t.vf.info.distance[0]}</b>
    <span>{t.vf.info.distance[1]}:
      <input class="field-input num" style="min-height: 32px; width: 4.5em" type="number" min="0.1" max="10000" step="0.1" aria-label={t.vf.info.distanceInput} bind:value={vf.setup.distance} /> m</span>
  </div>
  <span class="vf-num">{d.coverage.width.toFixed(2)} x {d.coverage.height.toFixed(2)} m</span>
</div>
