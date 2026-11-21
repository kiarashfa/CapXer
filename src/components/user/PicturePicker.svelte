<script lang="ts">
  // The profile picture dialog: a photo (round crop: drag, arrow keys, zoom slider,
  // wheel or +/-) or one or two letters on a colour.
  import { onDestroy, onMount, untrack } from 'svelte';
  import { t } from '../../i18n/en.ts';
  import { TINTS, type Profile, type Tint } from '../../storage/schema.ts';
  import { cleanInitials, initialsOf } from '../../storage/sanitize.ts';
  import { clampCrop, decode, MAX_ZOOM, render, type Crop } from '../../user/picture.ts';
  import Avatar from './Avatar.svelte';

  type Tab = 'photo' | 'initials';
  type Result = { picture: string } | { initials: { letters: string; tint: Tint } };
  let { tab: startTab, profile, onclose, onsave }: { tab: Tab; profile: Profile | undefined; onclose: () => void; onsave: (r: Result) => void } = $props();

  const P = t.user.picture;
  const STAGE = 240;
  const D = 200;

  let dialog = $state<HTMLDialogElement>();
  let fileInput = $state<HTMLInputElement>();
  let tab = $state<Tab>(untrack(() => startTab));
  let error = $state('');

  // Initials.
  const first = untrack(() => profile);
  let letters = $state(first?.initials?.letters ?? initialsOf(first?.name ?? ''));
  let tint = $state<Tint>(first?.initials?.tint ?? 'blue');
  const clean = $derived(cleanInitials(letters));

  // Photo.
  let bitmap = $state<ImageBitmap | null>(null);
  let src = $state('');
  let crop = $state<Crop>({ zoom: 1, x: 0, y: 0 });
  const size = $derived(bitmap ? { w: bitmap.width, h: bitmap.height } : { w: 1, h: 1 });
  const short = $derived(Math.min(size.w, size.h));
  const imgW = $derived((size.w / short) * crop.zoom * D);
  const imgH = $derived((size.h / short) * crop.zoom * D);

  onMount(() => {
    dialog?.showModal();
    if (tab === 'photo') fileInput?.click();
  });
  onDestroy(() => {
    if (src) URL.revokeObjectURL(src);
    bitmap?.close();
  });

  async function pick(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!f) return;
    error = '';
    try {
      const b = await decode(f);
      bitmap?.close();
      if (src) URL.revokeObjectURL(src);
      bitmap = b;
      src = URL.createObjectURL(f);
      crop = { zoom: 1, x: 0, y: 0 };
    } catch (err) {
      error = (err as Error).message === 'tooBig' ? P.tooBig : P.notImage;
    }
  }

  const set = (c: Crop) => (crop = clampCrop(c, size.w, size.h));

  let drag: { id: number; x: number; y: number; start: Crop } | null = null;
  function down(e: PointerEvent) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...crop } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    set({ ...drag.start, x: drag.start.x + (e.clientX - drag.x) / D, y: drag.start.y + (e.clientY - drag.y) / D });
  }
  const up = () => (drag = null);
  function wheel(e: WheelEvent) {
    e.preventDefault();
    set({ ...crop, zoom: crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) });
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) set({ ...crop, x: crop.x + moves[e.key]![0], y: crop.y + moves[e.key]![1] });
    else if (e.key === '+' || e.key === '=') set({ ...crop, zoom: crop.zoom * 1.1 });
    else if (e.key === '-') set({ ...crop, zoom: crop.zoom / 1.1 });
    else return;
    e.preventDefault();
  }

  const ready = $derived(tab === 'photo' ? !!bitmap : !!clean);
  function save() {
    if (tab === 'photo' && bitmap) onsave({ picture: render(bitmap, crop) });
    else if (tab === 'initials' && clean) onsave({ initials: { letters: clean, tint } });
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} class="dlg pp" aria-labelledby="pp-title" onclose={onclose} data-testid="picture-dialog">
  <h2 id="pp-title">{P.title}</h2>
  <div class="seg pp-seg" role="group" aria-label={P.title}>
    <button type="button" aria-pressed={tab === 'photo'} onclick={() => (tab = 'photo')}>{P.photo}</button>
    <button type="button" aria-pressed={tab === 'initials'} onclick={() => (tab = 'initials')}>{P.initials}</button>
  </div>

  <input bind:this={fileInput} class="sr-only" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={pick} data-testid="picture-input" />

  {#if tab === 'photo'}
    {#if bitmap}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="pp-stage"
        style:--stage={`${STAGE}px`}
        role="img"
        aria-label={P.cropLabel}
        tabindex="0"
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onwheel={wheel}
        onkeydown={key}
        data-testid="picture-crop"
      >
        <img src={src} alt="" draggable="false" style:width={`${imgW}px`} style:height={`${imgH}px`} style:left={`${STAGE / 2 + crop.x * D - imgW / 2}px`} style:top={`${STAGE / 2 + crop.y * D - imgH / 2}px`} />
      </div>
      <label class="pp-zoom">
        {P.zoom}
        <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={crop.zoom} oninput={(e) => set({ ...crop, zoom: Number((e.currentTarget as HTMLInputElement).value) })} />
      </label>
      <p class="pp-hint">{P.cropHint}</p>
      <div><button type="button" class="btn btn-secondary" onclick={() => fileInput?.click()}>{P.chooseOther}</button></div>
    {:else}
      <button type="button" class="pp-empty" onclick={() => fileInput?.click()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"></rect><circle cx="9" cy="11" r="2"></circle><path d="m21 16-5-5-8 8"></path></svg>
        {P.choose}
      </button>
    {/if}
  {:else}
    <div class="pp-ini">
      <Avatar profile={{ picture: null, initials: clean ? { letters: clean, tint } : null }} size={88} />
      <label class="pp-letters">
        {P.letters}
        <input type="text" bind:value={letters} maxlength="4" autocomplete="off" spellcheck="false" data-testid="initials-input" />
      </label>
    </div>
    <fieldset class="pp-tints">
      <legend>{P.colour}</legend>
      <div>
        {#each TINTS as c (c)}
          <label class="pp-tint" title={P.tints[c]}>
            <input type="radio" name="pp-tint" value={c} bind:group={tint} class="sr-only" aria-label={P.tints[c]} />
            <span class="avatar" style:--av="36px" data-kind="initials" data-tint={c} aria-hidden="true"></span>
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  {#if error}<p class="dlg-error" role="alert">{error}</p>{/if}

  <div class="dlg-acts">
    <button type="button" class="btn btn-secondary" onclick={() => dialog?.close()}>{P.cancel}</button>
    <button type="button" class="btn btn-primary" disabled={!ready} onclick={save} data-testid="picture-save">{P.use}</button>
  </div>
</dialog>

<style>
  .pp { display: grid; gap: 16px; }
  .pp h2 { margin: 0; }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 9999px; background: var(--tint); }
  .seg button { flex: 1; min-height: 40px; border: 0; border-radius: 9999px; background: transparent; color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
  .seg button[aria-pressed='true'] { background: var(--surface); color: var(--accent); box-shadow: 0 1px 3px rgb(0 0 0 / 0.15); }
  .pp-stage { position: relative; width: var(--stage); height: var(--stage); margin: 0 auto; overflow: hidden; border-radius: 16px; background: #222; cursor: grab; touch-action: none; }
  .pp-stage:active { cursor: grabbing; }
  .pp-stage img { position: absolute; max-width: none; user-select: none; pointer-events: none; }
  /* Dim outside the circle; a white ring marks it. */
  .pp-stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at center, transparent 99px, rgb(0 0 0 / 0.55) 100.5px); }
  .pp-stage::before { content: ''; position: absolute; z-index: 1; inset: 19px; pointer-events: none; border: 2px solid #fff; border-radius: 9999px; }
  .pp-stage:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  .pp-zoom { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 0.875rem; }
  .pp-zoom input { flex: 1; min-height: 44px; accent-color: var(--accent); }
  .pp-hint { font-size: 0.8125rem; }
  .pp-empty { display: grid; place-items: center; gap: 8px; min-height: 200px; border: 1.5px dashed var(--control); border-radius: 16px; background: transparent; color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
  .pp-empty:hover { background: var(--tint); }
  .pp-empty svg { width: 32px; height: 32px; color: var(--accent); }
  .pp-ini { display: flex; align-items: center; gap: 20px; }
  .pp-letters { display: grid; gap: 6px; color: var(--muted); font-size: 0.875rem; }
  .pp-letters input { width: 7rem; min-height: 44px; padding: 0 16px; border: 1px solid var(--control); border-radius: 9999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 1.125rem; font-weight: 700; text-transform: uppercase; }
  .pp-tints { border: 0; margin: 0; padding: 0; }
  .pp-tints legend { margin-bottom: 8px; color: var(--muted); font-size: 0.875rem; }
  .pp-tints div { display: flex; flex-wrap: wrap; gap: 6px; }
  .pp-tint { display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 9999px; cursor: pointer; }
  .pp-tint:has(input:checked) { box-shadow: inset 0 0 0 2px var(--ink); }
  .pp-tint:has(input:focus-visible) { outline: 3px solid var(--accent); outline-offset: 1px; }
</style>
