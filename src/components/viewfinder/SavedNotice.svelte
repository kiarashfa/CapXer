<script lang="ts">
  import { saved, notify, saveShared, backToMine, keepShared } from '../../storage/persist.svelte.ts';
  import { t } from '../../i18n/en.ts';

  // The viewfinder's notes ("Link copied", "Opened a shared setup"...), shown in
  // the site-wide notice stack at the bottom of the screen (BaseLayout #toasts).

  const N = t.vf.saved.notice;

  /** Moves the note into the page's notice stack so it sits with the update note. */
  function toStack(node: HTMLElement) {
    document.getElementById('toasts')?.append(node);
  }

  const n = $derived(saved.notice);
  const close = () => (n?.kind === 'shared' ? keepShared() : notify(null));
</script>

{#if n}
  <div class="toast" use:toStack data-testid="vf-notice">
    <div class="toast-msg">
      <b>{n.title}</b>
      {#if n.body}<span>{n.body}</span>{/if}
      {#if n.link}<input class="toast-link" readonly value={n.link} aria-label={n.title} onfocus={(e) => e.currentTarget.select()} />{/if}
    </div>
    <div class="toast-acts">
      {#if n.kind === 'shared'}
        <button type="button" class="main" onclick={saveShared}>{N.saveIt}</button>
        <button type="button" onclick={backToMine}>{N.backToMine}</button>
      {:else if n.kind === 'undo' && n.undo}
        <button type="button" class="main" onclick={n.undo}>{N.undo}</button>
      {/if}
      <button type="button" class="x" aria-label={n.kind === 'shared' ? N.keep : t.vf.saved.close} title={n.kind === 'shared' ? N.keep : t.vf.saved.close} onclick={close}>
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
      </button>
    </div>
  </div>
{/if}
