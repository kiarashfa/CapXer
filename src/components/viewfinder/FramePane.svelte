<script lang="ts">
  import { vf } from '../../setup/store.svelte.ts';
  import { ASPECTS, SQUEEZES } from '../../setup/presets.ts';
  import { t } from '../../i18n/en.ts';
</script>

<div class="vf-row stack">
  <div class="vf-txt"><b>{t.vf.frame.label}</b><span>{t.vf.frame.hint}</span></div>
  <div class="chips" role="group" aria-label={t.vf.frame.label}>
    {#each ASPECTS[vf.setup.mode] as a}
      <button type="button" class="chip" class:mono={a.id !== 'full'} aria-pressed={vf.setup.aspect === a.id} onclick={() => (vf.setup.aspect = a.id)}>{a.label}</button>
    {/each}
  </div>
</div>

<div class="vf-row">
  <label class="vf-txt" for="vf-squeeze"><b>{t.vf.frame.squeeze}</b><span>{t.vf.frame.squeezeHint}</span></label>
  <select id="vf-squeeze" class="select" value={vf.setup.squeeze} onchange={(e) => (vf.setup.squeeze = Number(e.currentTarget.value))}>
    {#each SQUEEZES as s}<option value={s}>{s === 1 ? t.vf.frame.spherical : `${s}x`}</option>{/each}
  </select>
</div>
