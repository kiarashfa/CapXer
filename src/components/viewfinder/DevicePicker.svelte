<script lang="ts">
  import { devices, displayName } from '../../data/index.ts';
  import { live } from '../../camera/live.svelte.ts';
  import { t } from '../../i18n/en.ts';

  // Same pattern as the camera picker: a searchable modal list that scales to
  // a large device database, grouped into phones and webcams.

  let dialog = $state<HTMLDialogElement>();
  let query = $state('');

  export function open() {
    query = '';
    dialog?.showModal();
  }

  const q = $derived(query.trim().toLowerCase());
  const groups = $derived(
    (['phone', 'webcam'] as const)
      .map((kind) => ({
        kind,
        items: devices.filter((d) => d.kind === kind && (!q || displayName(d).toLowerCase().includes(q))),
      }))
      .filter((g) => g.items.length > 0),
  );
  const current = $derived(live.effective.kind === 'device' ? live.effective.deviceId : '');

  function pick(id: string) {
    const dev = devices.find((d) => d.id === id)!;
    const cam = (live.facing === 'user' && dev.cameras.find((c) => c.facing === 'front')) || dev.cameras[0]!;
    live.calibration = { kind: 'device', deviceId: id, cameraId: cam.id };
    dialog?.close();
  }

  const spec = (c: { equivalent?: number; diagonalFov?: number }) => (c.equivalent !== undefined ? `${c.equivalent} mm` : `${c.diagonalFov}°`);
</script>

<dialog bind:this={dialog} class="vf-dialog" aria-labelledby="vf-device-title" data-testid="device-dialog">
  <header>
    <h2 id="vf-device-title">{t.vf.live.picker.title}</h2>
    <button type="button" class="icon-btn" aria-label={t.vf.picker.close} onclick={() => dialog?.close()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
    </button>
  </header>
  <input class="field-input search" type="search" placeholder={t.vf.live.picker.search} aria-label={t.vf.live.picker.search} bind:value={query} />
  <div class="list">
    {#each groups as g}
      <h3>{t.vf.live.picker[g.kind]}</h3>
      {#each g.items as d}
        <button type="button" class="item" aria-current={current === d.id} onclick={() => pick(d.id)}>
          <span>{displayName(d)}</span><span class="size">{spec(d.cameras[0]!)}</span>
        </button>
      {/each}
    {/each}
    {#if !groups.length}<p class="px-3 py-4 text-muted">{t.vf.live.picker.none}</p>{/if}
  </div>
</dialog>
