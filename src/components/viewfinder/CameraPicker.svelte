<script lang="ts">
  import { displayName, fullFormat, sensors } from '../../data/index.ts';
  import { FORMAT_CLASSES } from '../../data/constants.ts';
  import { vf } from '../../setup/store.svelte.ts';
  import { t } from '../../i18n/en.ts';

  // A modal list that scales to thousands of sensors: search by maker or model,
  // grouped by format class (largest first), the user's own sensors on top.

  let dialog = $state<HTMLDialogElement>();
  let query = $state('');

  export function open() {
    query = '';
    dialog?.showModal();
  }

  const q = $derived(query.trim().toLowerCase());
  const groups = $derived(
    FORMAT_CLASSES.map((cls) => ({
      cls,
      items: sensors
        .filter((s) => s.formatClass === cls)
        .map((s) => ({ id: s.id, name: displayName(s), size: `${fullFormat(s).width} x ${fullFormat(s).height}` }))
        .filter((s) => !q || s.name.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0),
  );
  const yours = $derived(vf.customs.filter((c) => !q || c.name.toLowerCase().includes(q)));

  function pick(id: string) {
    vf.setCamera(id);
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} class="vf-dialog" aria-labelledby="vf-picker-title" data-testid="camera-dialog">
  <header>
    <h2 id="vf-picker-title">{t.vf.picker.title}</h2>
    <button type="button" class="icon-btn" aria-label={t.vf.picker.close} onclick={() => dialog?.close()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
    </button>
  </header>
  <input class="field-input search" type="search" placeholder={t.vf.picker.search} aria-label={t.vf.picker.search} bind:value={query} />
  <div class="list">
    {#if yours.length}
      <h3>{t.vf.picker.yours}</h3>
      {#each yours as c}
        <button type="button" class="item" aria-current={vf.setup.sensorId === c.id} onclick={() => pick(c.id)}>
          <span>{c.name}</span><span class="size">{c.width} x {c.height} mm</span>
        </button>
      {/each}
    {/if}
    {#each groups as g}
      <h3>{t.vf.classes[g.cls]}</h3>
      {#each g.items as s}
        <button type="button" class="item" aria-current={vf.setup.sensorId === s.id} onclick={() => pick(s.id)}>
          <span>{s.name}</span><span class="size">{s.size} mm</span>
        </button>
      {/each}
    {/each}
    {#if !groups.length && !yours.length}<p class="px-3 py-4 text-muted">{t.vf.picker.none}</p>{/if}
  </div>
</dialog>
