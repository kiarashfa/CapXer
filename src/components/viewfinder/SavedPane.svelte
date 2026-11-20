<script lang="ts">
  import { tick } from 'svelte';
  import { vf } from '../../setup/store.svelte.ts';
  import {
    saved,
    summaryOf,
    suggestName,
    sameSetup,
    saveCurrent,
    openSaved,
    renameSaved,
    replaceSaved,
    deleteSaved,
    share,
    exportFile,
    readImport,
    applyImport,
    clearAll,
    type PendingImport,
  } from '../../storage/persist.svelte.ts';
  import { t } from '../../i18n/en.ts';

  // The Saved panel: save the current setup, the saved list, share, and the
  // whole save file (export, import, clear). Everything stays in this browser.

  const S = t.vf.saved;
  const I = S.import;

  let name = $state('');
  let menuFor = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let renameText = $state('');
  let fileInput = $state<HTMLInputElement>();
  let importDlg = $state<HTMLDialogElement>();
  let clearDlg = $state<HTMLDialogElement>();
  // Raw: the file is handed on as plain data (merging copies it with structuredClone).
  let pending = $state.raw<PendingImport | null>(null);
  let how = $state<'merge' | 'replace'>('merge');

  const suggestion = $derived(suggestName(vf.setup));
  const summary = $derived(summaryOf(vf.setup));

  function onsave(e: SubmitEvent) {
    e.preventDefault();
    if (saveCurrent(name.trim() || suggestion)) name = '';
  }

  function toggleMenu(id: string) {
    menuFor = menuFor === id ? null : id;
  }

  async function startRename(id: string, current: string) {
    menuFor = null;
    renaming = id;
    renameText = current;
    await tick();
    document.getElementById(`sv-rename-${id}`)?.focus();
  }

  async function finishRename(e?: SubmitEvent) {
    e?.preventDefault();
    const id = renaming;
    if (!id) return;
    renameSaved(id, renameText);
    renaming = null;
    await tick();
    document.querySelector<HTMLElement>(`[data-setup="${id}"]`)?.focus();
  }

  function menuAction(fn: () => void) {
    const id = menuFor;
    menuFor = null;
    fn();
    if (id) tick().then(() => document.querySelector<HTMLElement>(`[data-more="${id}"]`)?.focus());
  }

  async function onfile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    pending = await readImport(f);
    how = 'merge';
    if (pending) importDlg?.showModal();
  }

  function doImport() {
    if (pending) applyImport(pending, how);
    pending = null;
    importDlg?.close();
  }

  function onwindowclick(e: MouseEvent) {
    if (menuFor && !(e.target as Element).closest('.sv-menu, .sv-more')) menuFor = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (renaming) {
      e.stopPropagation();
      renaming = null;
    } else if (menuFor) {
      e.stopPropagation();
      const id = menuFor;
      menuFor = null;
      document.querySelector<HTMLElement>(`[data-more="${id}"]`)?.focus();
    }
  }
</script>

<svelte:window onclick={onwindowclick} />

{#snippet icon(d: string)}
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{@html d}</svg>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div onkeydown={onkeydown}>
  <div class="vf-row stack">
    <div class="vf-txt"><b>{S.current}</b><span class="sv-sum" data-testid="saved-summary">{summary}</span></div>
    <form class="sv-save" onsubmit={onsave}>
      <input class="field-input" aria-label={S.nameLabel} placeholder={suggestion} maxlength="60" bind:value={name} data-testid="saved-name" />
      <button type="submit" class="btn btn-primary">{S.save}</button>
    </form>
    <button type="button" class="btn btn-secondary sv-wide" onclick={() => share()}>
      {@render icon('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7h14v-7"/>')}{S.share}
    </button>
  </div>

  <div class="vf-row stack">
    <div class="sv-head"><h3>{S.list}</h3>{#if saved.setups.length}<span class="sv-sum">{saved.setups.length}</span>{/if}</div>
    {#if !saved.setups.length}
      <p class="vf-note">{S.empty}</p>
    {:else}
      <ul class="sv-list" data-testid="saved-list">
        {#each saved.setups as s (s.id)}
          {@const showing = !saved.shared && sameSetup(s.setup, vf.setup)}
          <li class:current={showing}>
            {#if renaming === s.id}
              <form class="sv-rename" onsubmit={finishRename}>
                <input id={`sv-rename-${s.id}`} class="field-input" aria-label={`${S.renameLabel} ${s.name}`} maxlength="60" bind:value={renameText} />
                <button type="submit" class="btn btn-secondary">{S.done}</button>
              </form>
            {:else}
              <button type="button" class="sv-item" data-setup={s.id} aria-current={showing ? 'true' : undefined} onclick={() => openSaved(s.id)}>
                <span class="nm"><span class="sv-name">{s.name}</span>{#if s.setup.mode === 'stills'}<span class="sv-tag">{S.stills}</span>{/if}{#if showing}<span class="sv-tag">{S.showing}</span>{/if}</span>
                <span class="sv-sum">{summaryOf(s.setup)}</span>
              </button>
              <button
                type="button"
                class="icon-btn sv-more"
                data-more={s.id}
                aria-label={`${S.more} ${s.name}`}
                aria-expanded={menuFor === s.id}
                aria-controls={`sv-menu-${s.id}`}
                onclick={() => toggleMenu(s.id)}
              >
                {@render icon('<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>')}
              </button>
              {#if menuFor === s.id}
                <!-- Opens inside the card (nothing is covered), one row of actions. -->
                <div class="sv-menu" id={`sv-menu-${s.id}`} role="group" aria-label={`${S.more} ${s.name}`}>
                  <button type="button" class="chip" onclick={() => menuAction(() => share(s.setup))}>{S.share}</button>
                  <button type="button" class="chip" onclick={() => startRename(s.id, s.name)}>{S.rename}</button>
                  <button type="button" class="chip" onclick={() => menuAction(() => replaceSaved(s.id))}>{S.replace}</button>
                  <button type="button" class="chip" onclick={() => menuAction(() => deleteSaved(s.id))}>{S.remove}</button>
                </div>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="vf-row stack">
    <div class="vf-txt"><b>{S.data[0]}</b><span>{S.data[1]}</span></div>
    {#if !saved.available}<p class="vf-note" data-testid="saved-unavailable">{S.unavailable}</p>{/if}
    <div class="sv-actions">
      <button type="button" class="btn btn-secondary" onclick={exportFile} data-testid="saved-export">
        {@render icon('<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/>')}{S.exportFile}
      </button>
      <button type="button" class="btn btn-secondary" onclick={() => fileInput?.click()}>
        {@render icon('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 19h14"/>')}{S.importFile}
      </button>
    </div>
    <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onfile} data-testid="saved-import" />
    <button type="button" class="sv-clear" onclick={() => clearDlg?.showModal()}>{S.clear}</button>
  </div>
</div>

<dialog bind:this={importDlg} class="vf-dialog sv-dlg" aria-labelledby="sv-import-title" data-testid="import-dialog" onclose={() => (pending = null)}>
  <header>
    <h2 id="sv-import-title">{I.title}</h2>
    <button type="button" class="icon-btn" aria-label={S.close} onclick={() => importDlg?.close()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
    </button>
  </header>
  {#if pending}
    {@const sm = pending.summary}
    <div class="sv-dlg-body">
      <p class="sv-file">{pending.name}</p>
      <ul class="sv-facts">
        <li>{I.setups} <span>{sm.setups}{#if sm.renamed}{' '}({sm.renamed} {I.renamed}){/if}</span></li>
        <li>{I.cameras} <span>{sm.cameras}</span></li>
        <li>{I.lenses} <span>{sm.lenses}</span></li>
        {#if sm.phone}<li>{I.phone} <span>{I.yes}</span></li>{/if}
        {#if sm.webcam}<li>{I.webcam} <span>{I.yes}</span></li>{/if}
        <li>{I.aids} <span>{I.yes}</span></li>
      </ul>
      <fieldset class="sv-how">
        <legend class="sr-only">{I.how}</legend>
        <label class="sv-opt"><input type="radio" name="sv-how" value="merge" bind:group={how} /><span><b>{I.merge[0]}</b><small>{I.merge[1]}</small></span></label>
        <label class="sv-opt"><input type="radio" name="sv-how" value="replace" bind:group={how} /><span><b>{I.replace[0]}</b><small>{I.replace[1]}</small></span></label>
      </fieldset>
    </div>
  {/if}
  <footer class="sv-dlg-foot">
    <button type="button" class="btn btn-secondary" onclick={() => importDlg?.close()}>{S.cancel}</button>
    <button type="button" class="btn btn-primary" onclick={doImport}>{I.submit}</button>
  </footer>
</dialog>

<dialog bind:this={clearDlg} class="vf-dialog sv-dlg" aria-labelledby="sv-clear-title" aria-describedby="sv-clear-body" data-testid="clear-dialog">
  <header>
    <h2 id="sv-clear-title">{S.clearTitle}</h2>
  </header>
  <div class="sv-dlg-body"><p id="sv-clear-body" class="sv-dlg-text">{S.clearBody}</p></div>
  <footer class="sv-dlg-foot">
    <button type="button" class="btn btn-secondary" onclick={() => clearDlg?.close()}>{S.cancel}</button>
    <button type="button" class="btn btn-primary" onclick={() => { clearAll(); clearDlg?.close(); }}>{S.clearConfirm}</button>
  </footer>
</dialog>
