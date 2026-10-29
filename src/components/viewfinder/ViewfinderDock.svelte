<script lang="ts">
  import { vf } from '../../setup/store.svelte.ts';
  import { toEntry } from '../../setup/focal.ts';
  import type { PanelId } from '../../setup/types.ts';
  import { PANEL_CLOSED_EVENT } from '../../lib/site-bar.ts';
  import { t } from '../../i18n/en.ts';

  // The viewfinder's tools in the site bar's dock (desktop). Each opens its
  // pane from Viewfinder.svelte as a floating panel; the store is shared.
  const shown = $derived(toEntry(vf.setup.focal, vf.setup.focalEntry, vf.derived.crop));
  const ff = $derived(vf.setup.focalEntry === 'equivalent' ? ' FF' : '');

  function toggle(p: PanelId) {
    const closing = vf.panel === p;
    vf.panel = closing ? null : p;
    if (closing) window.dispatchEvent(new Event(PANEL_CLOSED_EVENT));
  }
</script>

{#snippet tool(p: PanelId, icon: string)}
  <button type="button" class="dock-tool" aria-expanded={vf.panel === p} aria-controls={`vf-pane-${p}`} onclick={() => toggle(p)}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{@html icon}</svg>{t.vf.panels[p]}
  </button>
{/snippet}

<div class="dock-row" data-testid="vf-dock">
  {@render tool('camera', '<rect x="3" y="7" width="13" height="11" rx="2"/><path d="m16 11 5-3v9l-5-3"/>')}
  {@render tool('frame', '<path d="M3 8V5h4M17 5h4v3M21 16v3h-4M7 19H3v-3"/><rect x="7" y="9" width="10" height="6" rx="1"/>')}
  {@render tool('guides', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M15 5v14M3 10h18M3 14h18"/>')}
  {@render tool('live', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>')}
  {@render tool('exposure', '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>')}
  <span class="dock-sep" aria-hidden="true"></span>
  <button type="button" class="dock-icon" style="border: 1px solid var(--control)" aria-label={t.vf.lens.shorter} onclick={() => vf.step(-1)}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12"></path></svg>
  </button>
  <button
    type="button"
    class="dock-tool vf-num"
    style="min-width: 96px; justify-content: center; background: var(--tint); color: var(--accent); font-size: 1.125rem"
    aria-expanded={vf.panel === 'lens'}
    aria-controls="vf-pane-lens"
    aria-label={`${shown} mm${ff}, ${t.vf.lens.label.toLowerCase()}, ${t.vf.lens.openPanel}`}
    onclick={() => toggle('lens')}>{shown}{' '}<small class="text-xs">mm{ff}</small></button
  >
  <button type="button" class="dock-icon" style="border: 1px solid var(--control)" aria-label={t.vf.lens.longer} onclick={() => vf.step(1)}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12M12 6v12"></path></svg>
  </button>
  <span class="dock-sep" aria-hidden="true"></span>
  {@render tool('info', '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>')}
</div>
