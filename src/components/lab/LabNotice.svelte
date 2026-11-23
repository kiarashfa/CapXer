<script lang="ts">
  import { t } from '../../i18n/en.ts';
  import { labNotify } from '../../lab/persist.svelte.ts';
  import { lab } from '../../lab/store.svelte.ts';

  // The lab's notes ("Saved", "Deleted" with Undo, "Link copied") in the
  // site-wide notice stack at the bottom of the screen (BaseLayout #toasts),
  // the same place and look as the viewfinder's.
  const N = t.lab.notice;

  function toStack(node: HTMLElement) {
    document.getElementById('toasts')?.append(node);
  }
</script>

{#if lab.notice}
  {@const n = lab.notice}
  <div class="toast" use:toStack data-testid="lab-notice">
    <div class="toast-msg">
      <b>{n.title}</b>
      {#if n.body}<span>{n.body}</span>{/if}
    </div>
    <div class="toast-acts">
      {#if n.undo}<button type="button" class="main" onclick={n.undo}>{N.undo}</button>{/if}
      <button type="button" class="x" aria-label={N.close} title={N.close} onclick={() => labNotify(null)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
      </button>
    </div>
  </div>
{/if}
