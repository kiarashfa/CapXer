<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '../../i18n/en.ts';
  import { url } from '../../lib/url.ts';
  import { CONSENT_OPEN_EVENT, readConsent, writeConsent, type ConsentChoice } from '../../lib/consent.ts';
  import { disableAnalytics, enableAnalytics } from '../../lib/analytics.ts';

  let open = $state(false);
  let region = $state<HTMLElement>();

  onMount(() => {
    const rec = readConsent();
    if (rec?.analytics === 'granted') enableAnalytics();
    else if (!rec) open = true;

    const reopen = async () => {
      open = true;
      await tick();
      region?.focus();
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  });

  function choose(choice: ConsentChoice) {
    writeConsent(choice);
    if (choice === 'granted') enableAnalytics();
    else disableAnalytics();
    open = false;
  }
</script>

{#if open}
  <section
    bind:this={region}
    tabindex="-1"
    aria-labelledby="consent-title"
    data-testid="consent-banner"
    class="card fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl p-5 text-ink shadow-xl desktop:inset-x-4 desktop:bottom-4"
    style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom));"
  >
    <h2 id="consent-title" class="text-base font-bold">{t.consent.title}</h2>
    <p class="mt-1 text-sm leading-relaxed text-muted">
      {t.consent.body}
      <a href={url('privacy')}>{t.consent.more}</a>
    </p>
    <!-- Equal weight on purpose: declining must be as easy as accepting. -->
    <div class="mt-4 grid grid-cols-2 gap-2">
      <button type="button" class="btn btn-secondary px-3" onclick={() => choose('denied')}>
        {t.consent.decline}
      </button>
      <button type="button" class="btn btn-secondary px-3" onclick={() => choose('granted')}>
        {t.consent.accept}
      </button>
    </div>
  </section>
{/if}
