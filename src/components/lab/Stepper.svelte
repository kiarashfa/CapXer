<script lang="ts">
  // One setting with a value between two step buttons (- and +).
  interface Side {
    label: string;
    disabled?: boolean;
    onclick: () => void;
  }
  let {
    id,
    label,
    value,
    sub,
    less,
    more,
  }: { id: string; label: string; value: string; sub?: string; less: Side; more: Side } = $props();
</script>

<div class="lab-step" role="group" aria-labelledby="{id}-label">
  <span class="lab-step-label" id="{id}-label">{label}</span>
  <div class="lab-step-row">
    <button
      type="button"
      class="dock-icon"
      aria-label={less.label}
      title={less.label}
      disabled={less.disabled}
      onclick={less.onclick}
      data-testid="{id}-less"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"><path d="M6 12h12" /></svg
      >
    </button>
    <output class="vf-num" aria-live="polite" data-testid="{id}-value">{value}</output>
    <button
      type="button"
      class="dock-icon"
      aria-label={more.label}
      title={more.label}
      disabled={more.disabled}
      onclick={more.onclick}
      data-testid="{id}-more"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"><path d="M6 12h12M12 6v12" /></svg
      >
    </button>
  </div>
  {#if sub}<span class="lab-step-sub">{sub}</span>{/if}
</div>
