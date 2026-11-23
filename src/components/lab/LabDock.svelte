<script lang="ts">
  import { t } from '../../i18n/en.ts';
  import { PANEL_CLOSED_EVENT } from '../../lib/site-bar.ts';
  import { lab, type LabPanel } from '../../lab/store.svelte.ts';

  // The lab's tools in the site bar's dock. Each opens its pane in the right
  // column, in place of the studio plan; the store is shared with the page.
  function toggle(p: LabPanel) {
    const closing = lab.panel === p;
    lab.panel = closing ? null : p;
    if (closing) window.dispatchEvent(new Event(PANEL_CLOSED_EVENT));
  }
</script>

{#snippet tool(p: LabPanel, icon: string)}
  <button type="button" class="dock-tool" title={t.lab.panels[p]} aria-expanded={lab.panel === p} aria-controls={`lab-pane-${p}`} onclick={() => toggle(p)} data-testid={`lab-tool-${p}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{@html icon}</svg><span class="dock-text">{t.lab.panels[p]}</span>
  </button>
{/snippet}

<div class="dock-row" data-testid="lab-dock">
  {@render tool('set', '<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M10 20v-5h4v5"/>')}
  {@render tool('lights', '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>')}
  {@render tool('camera', '<rect x="3" y="7" width="13" height="11" rx="2"/><path d="m16 11 5-3v9l-5-3"/>')}
  {@render tool('aids', '<path d="M3 20h18"/><path d="M5 20v-6M9 20V8M13 20v-9M17 20v-4"/>')}
</div>
