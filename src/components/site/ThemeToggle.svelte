<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../i18n/en.ts';
  import { applyTheme, currentTheme, type Theme } from '../../lib/theme.ts';
  import { track } from '../../lib/analytics.ts';

  // null until mounted: the server cannot know the visitor's theme.
  let theme = $state<Theme | null>(null);
  const label = $derived(
    theme === null ? t.theme.toggle : theme === 'dark' ? t.theme.toLight : t.theme.toDark,
  );

  onMount(() => {
    theme = currentTheme();
  });

  function toggle() {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    theme = next;
    track('theme_change', { theme: next });
  }
</script>

<button
  type="button"
  class="inline-flex size-11 items-center justify-center rounded-md border border-line text-fg hover:bg-surface"
  aria-label={label}
  title={label}
  data-testid="theme-toggle"
  onclick={toggle}
>
  {#if theme === 'light'}
    <!-- moon: switch to dark -->
    <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
  {:else}
    <!-- sun: switch to light -->
    <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  {/if}
</button>
