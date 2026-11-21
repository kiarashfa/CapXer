<script lang="ts">
  // The profile page (/user/). With nothing saved in this browser it shows the
  // three ways in (your save file is the key, your cloud, or start fresh);
  // otherwise your profile, cloud save, save file and sign out.
  // Everything is read from and written to the save file (src/storage/store.ts).
  import { onMount, tick } from 'svelte';
  import { t } from '../../i18n/en.ts';
  import { url } from '../../lib/url.ts';
  import { hasWork, readSave, REPLACED_EVENT, SAVE_EVENT, updateSave } from '../../storage/store.ts';
  import { mergeSave, parseFile } from '../../storage/file.ts';
  import { cleanProfileName, initialsOf } from '../../storage/sanitize.ts';
  import type { Profile, SaveFile, Tint } from '../../storage/schema.ts';
  import { ago, CLOUD_EVENT, cloudDot, cloudState, PROVIDERS, type CloudState, type Provider } from '../../user/local.ts';
  import { downloadSave, openSignOut, statusText } from '../../user/bar.ts';
  import Avatar from './Avatar.svelte';
  import PicturePicker from './PicturePicker.svelte';

  const U = t.user;
  const IMPORT = t.vf.saved.import;
  const GOOGLE_ID = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID ?? '';
  const DROPBOX_KEY = import.meta.env.PUBLIC_DROPBOX_APP_KEY ?? '';
  const available: Provider[] = [...(GOOGLE_ID ? ['google' as const] : []), ...(DROPBOX_KEY ? ['dropbox' as const] : [])];

  let file = $state<SaveFile | null>(null);
  let cloud = $state<CloudState | null>(null);
  let syncState = $state('idle');
  let ready = $state(false);
  /** "Set up your profile" was pressed on the welcome screen. */
  let starting = $state(false);
  let note = $state<{ text: string; error?: boolean } | null>(null);
  let busy = $state<Provider | null>(null);
  let now = $state(Date.now());

  let editing = $state(false);
  let nameDraft = $state('');
  let nameInput = $state<HTMLInputElement>();
  let picker = $state<'photo' | 'initials' | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let openButton = $state<HTMLButtonElement>();
  let importDlg = $state<HTMLDialogElement>();
  // Raw: a $state proxy would make structuredClone() in mergeSave throw.
  let pending = $state.raw<{ file: SaveFile; name: string } | null>(null);
  let dragging = $state(false);

  const profile = $derived(file?.profile);
  const showProfile = $derived(starting || hasWork(file) || !!cloud);
  const dot = $derived(cloudDot(cloud));
  const status = $derived.by(() => {
    void syncState;
    void now;
    return statusText(cloud, dot);
  });
  const facts = $derived.by(() => {
    if (!file) return '';
    const F = U.facts;
    const parts = [
      ...(file.setups.length ? [F.setups(file.setups.length)] : []),
      ...(file.gear.cameras.length ? [F.cameras(file.gear.cameras.length)] : []),
      ...(file.gear.lenses.length ? [F.lenses(file.gear.lenses.length)] : []),
      ...(file.calibration.phone ? [F.phone] : []),
      ...(file.calibration.webcam ? [F.webcam] : []),
    ];
    return parts.length ? parts.join(' · ') : F.nothing;
  });

  const refresh = () => {
    file = readSave();
    cloud = cloudState();
    now = Date.now();
  };

  const cloudModule = () => import('../../user/cloud.ts');

  onMount(() => {
    refresh();
    ready = true;
    const onCloud = (e: Event) => {
      const d = (e as CustomEvent<{ state: string; message?: string } | undefined>).detail;
      if (d) {
        syncState = d.state;
        if (d.state === 'auth' || d.state === 'error') note = { text: d.message ?? U.errors.generic, error: true };
      }
      refresh();
    };
    addEventListener(REPLACED_EVENT, refresh);
    addEventListener(SAVE_EVENT, refresh);
    addEventListener('storage', refresh);
    addEventListener(CLOUD_EVENT, onCloud);
    const timer = setInterval(() => (now = Date.now()), 30_000);

    try {
      if (sessionStorage.getItem('capxer.signedOut')) {
        sessionStorage.removeItem('capxer.signedOut');
        note = { text: U.signOut.done };
      }
    } catch {
      // No note then.
    }

    cloudModule().then(async (m) => {
      if (m.isDropboxReturn()) {
        busy = 'dropbox';
        note = { text: U.cloud.connecting(PROVIDERS.dropbox) };
        try {
          report(await m.finishDropbox());
        } catch (e) {
          note = { text: (e as Error).message, error: true };
        } finally {
          busy = null;
        }
      } else if (cloudState()) {
        m.startAutoSave();
        if (cloudState()?.provider === 'google') m.loadGoogle().catch(() => {});
      }
    });

    if (location.hash === '#open') tick().then(() => openButton?.focus());
    return () => {
      removeEventListener(REPLACED_EVENT, refresh);
      removeEventListener(SAVE_EVENT, refresh);
      removeEventListener('storage', refresh);
      removeEventListener(CLOUD_EVENT, onCloud);
      clearInterval(timer);
    };
  });

  function report(r: { changes: { added: number; updated: number; removed: number } | null }) {
    const n = r.changes ? r.changes.added + r.changes.updated + r.changes.removed : 0;
    note = { text: n ? U.cloud.brought(n) : U.cloud.upToDate };
  }

  // ---------- profile ----------

  const blank = (): Profile => ({ name: '', picture: null, initials: null, changedAt: new Date().toISOString() });

  function changeProfile(change: (p: Profile) => Profile) {
    updateSave((f) => ({ ...f, profile: { ...change(f.profile ?? blank()), changedAt: new Date().toISOString() } }));
    starting = false;
  }

  async function editName() {
    nameDraft = profile?.name ?? '';
    editing = true;
    await tick();
    nameInput?.focus();
  }

  function saveName(e: SubmitEvent) {
    e.preventDefault();
    const name = cleanProfileName(nameDraft);
    changeProfile((p) => ({
      ...p,
      name,
      // A first name with no picture yet gets its initials.
      initials: p.initials ?? (!p.picture && initialsOf(name) ? { letters: initialsOf(name), tint: 'blue' as Tint } : null),
    }));
    editing = false;
  }

  function setPicture(r: { picture: string } | { initials: { letters: string; tint: Tint } }) {
    changeProfile((p) => ('picture' in r ? { ...p, picture: r.picture } : { ...p, picture: null, initials: r.initials }));
  }

  function removePicture() {
    changeProfile((p) => ({ ...p, picture: null, initials: null }));
  }

  async function startFresh() {
    starting = true;
    await editName();
  }

  // ---------- save file ----------

  async function openFile(f: File | undefined) {
    if (!f) return;
    const r = parseFile(f.size > 2_000_000 ? '' : await f.text());
    if (!r.ok) {
      note = { text: r.reason === 'newer' ? t.vf.saved.notice.newer : t.vf.saved.notice.notCapxer, error: true };
      return;
    }
    if (!hasWork(readSave())) {
      // An empty browser: the file is your key, everything comes back as it was.
      updateSave(() => r.file);
      note = { text: U.file.welcome };
      return;
    }
    pending = { file: r.file, name: f.name };
    importDlg?.showModal();
  }

  function applyImport(how: 'merge' | 'replace') {
    if (!pending) return;
    const p = pending;
    updateSave((mine) => mergeSave(mine, p.file, how));
    note = { text: U.file.opened(p.name) };
    importDlg?.close();
  }

  function dropped(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    openFile(e.dataTransfer?.files?.[0]);
  }

  // ---------- cloud ----------

  async function connect(p: Provider) {
    note = null;
    busy = p;
    try {
      const m = await cloudModule();
      if (p === 'dropbox') return void (await m.connectDropbox());
      report(await m.connectGoogle());
    } catch (e) {
      note = { text: (e as Error).message, error: true };
    } finally {
      busy = null;
    }
  }

  async function saveNow() {
    note = null;
    try {
      const m = await cloudModule();
      if (cloud?.problem === 'auth' && cloud.provider === 'dropbox') return void (await m.connectDropbox());
      report(await m.sync({ interactive: true }));
    } catch (e) {
      note = { text: (e as Error).message, error: true };
    }
  }

  async function disconnect() {
    const p = cloud ? PROVIDERS[cloud.provider] : '';
    await (await cloudModule()).disconnect();
    note = { text: U.cloud.disconnected(p) };
    refresh();
  }

  const ICON = {
    google: '<path fill="#0f9d58" d="M8 3h8l6 10.5h-8z"/><path fill="#4285f4" d="M22 13.5 18 20.5H6l4-7z"/><path fill="#f4b400" d="M8 3 2 13.5l4 7 6-10.5z"/>',
    dropbox: '<path fill="#0061fe" d="m7 3 5 3.2-5 3.2-5-3.2zM17 3l5 3.2-5 3.2-5-3.2zM2 12.6l5-3.2 5 3.2-5 3.2zM17 9.4l5 3.2-5 3.2-5-3.2zM7 17l5-3.2 5 3.2-5 3.2z"/>',
  };
</script>

<input bind:this={fileInput} class="sr-only" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true" onchange={(e) => { openFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} data-testid="open-file-input" />

{#snippet providerButton(p: Provider, label: string)}
  <button type="button" class="prov" disabled={!!busy} onclick={() => connect(p)} data-testid={`connect-${p}`}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{@html ICON[p]}</svg>
    {busy === p ? U.cloud.connecting(PROVIDERS[p]) : label}
  </button>
{/snippet}

<div class="up" class:hidden={!ready}>
  <p class="up-lead">{showProfile ? U.lead : U.welcomeLead}</p>

  {#if note}
    <p class="up-note" class:error={note.error} role="status" data-testid="profile-note">{note.text}</p>
  {/if}

  {#if !showProfile}
    <div class="ways" data-testid="welcome">
      <section
        class="card way"
        class:drag={dragging}
        id="open"
        aria-labelledby="way-open"
        ondragover={(e) => { e.preventDefault(); dragging = true; }}
        ondragleave={() => (dragging = false)}
        ondrop={dropped}
      >
        <span class="num">01</span>
        <h2 id="way-open">{U.ways.open[0]}</h2>
        <p>{U.ways.open[1]}</p>
        <div class="drop">
          <span>{U.ways.drop}</span>
          <button bind:this={openButton} type="button" class="btn btn-primary" onclick={() => fileInput?.click()} data-testid="open-file">{U.ways.choose}</button>
        </div>
      </section>
      <section class="card way" aria-labelledby="way-cloud">
        <span class="num">02</span>
        <h2 id="way-cloud">{U.ways.cloud[0]}</h2>
        <p>{U.ways.cloud[1]}</p>
        {#if available.length}
          <div class="col">
            {#each available as p (p)}{@render providerButton(p, PROVIDERS[p])}{/each}
          </div>
        {:else}
          <p class="hint">{U.ways.noCloud}</p>
        {/if}
      </section>
      <section class="card way" aria-labelledby="way-fresh">
        <span class="num">03</span>
        <h2 id="way-fresh">{U.ways.fresh[0]}</h2>
        <p>{U.ways.fresh[1]}</p>
        <div class="row">
          <button type="button" class="btn btn-secondary" onclick={startFresh} data-testid="start-fresh">{U.ways.setup}</button>
          <a class="btn btn-secondary" href={url('viewfinder')}>{U.ways.viewfinder}</a>
        </div>
      </section>
    </div>
  {:else}
    <section class="card hero" aria-label={U.title} data-testid="profile-card">
      <Avatar {profile} size={112} />
      <div class="who">
        {#if editing}
          <form class="name-form" onsubmit={saveName}>
            <label for="profile-name">{U.name.label}</label>
            <div class="row">
              <input id="profile-name" bind:this={nameInput} bind:value={nameDraft} maxlength="40" autocomplete="name" data-testid="name-input" />
              <button type="submit" class="btn btn-primary">{U.name.save}</button>
              <button type="button" class="btn btn-secondary" onclick={() => { editing = false; starting = false; }}>{U.name.cancel}</button>
            </div>
            <small>{U.name.hint}</small>
          </form>
        {:else}
          <div class="name">
            {#if profile?.name}<span data-testid="profile-name">{profile.name}</span>{:else}<span class="muted">{U.noName}</span>{/if}
            <button type="button" class="btn btn-secondary small" onclick={editName} data-testid="edit-name">{U.name.edit}</button>
          </div>
        {/if}
        <div class="facts">{facts}</div>
        <div class="row">
          <button type="button" class="btn btn-secondary" onclick={() => (picker = 'photo')} data-testid="upload-photo">{U.picture.upload}</button>
          <button type="button" class="btn btn-secondary" onclick={() => (picker = 'initials')} data-testid="use-initials">{U.picture.initials}</button>
          {#if profile?.picture || profile?.initials}
            <button type="button" class="btn btn-secondary" onclick={removePicture}>{U.picture.remove}</button>
          {/if}
        </div>
      </div>
    </section>

    <div class="grid">
      <section class="card box" id="cloud" aria-labelledby="cloud-title" data-testid="cloud-card">
        <h2 id="cloud-title">{U.cloud.title}</h2>
        {#if cloud}
          <div class="status">
            <span class="status-dot" data-dot={dot} aria-hidden="true"></span>
            <div>
              <b>{status}</b>
              <span>{U.status.updates}</span>
            </div>
            <button type="button" class="btn btn-secondary" onclick={saveNow} disabled={syncState === 'saving'} data-testid="save-now">{U.cloud.saveNow}</button>
          </div>
          <dl class="kv">
            {#if cloud.account}<dt>{U.cloud.account}</dt><dd>{cloud.account.email || cloud.account.name}</dd>{/if}
            <dt>{U.cloud.where}</dt><dd>{cloud.provider === 'google' ? U.cloud.whereGoogle : U.cloud.whereDropbox}</dd>
            <dt>{U.cloud.last}</dt><dd>{cloud.syncedAt || cloud.savedAt ? ago(cloud.syncedAt ?? cloud.savedAt, now) : U.cloud.never}</dd>
          </dl>
          <div class="row"><button type="button" class="btn btn-secondary" onclick={disconnect} data-testid="disconnect">{U.cloud.disconnect}</button></div>
        {:else}
          <p>{U.cloud.intro}</p>
          {#if available.length}
            <div class="row">
              {#each available as p (p)}{@render providerButton(p, U.cloud.connect(PROVIDERS[p]))}{/each}
            </div>
            <p class="hint">{U.cloud.off}</p>
          {:else}
            <p class="hint">{U.ways.noCloud}</p>
          {/if}
        {/if}
      </section>

      <section class="card box" id="file" aria-labelledby="file-title">
        <h2 id="file-title">{U.file.title}</h2>
        <p>{U.file.body}</p>
        <div class="row">
          <button type="button" class="btn btn-primary" onclick={downloadSave} disabled={!file} data-testid="download-save">{U.file.download}</button>
          <button bind:this={openButton} type="button" class="btn btn-secondary" onclick={() => fileInput?.click()} data-testid="open-file">{U.file.open}</button>
        </div>
        <p class="hint">{U.file.hint}</p>
      </section>

      <section class="note box wide" id="signout" aria-labelledby="signout-card-title">
        <h2 id="signout-card-title">{U.signOut.title}</h2>
        <p>
          {U.signOut.body}
          {#if cloud}{' '}{U.signOut.kept(PROVIDERS[cloud.provider])}{:else if hasWork(file)}{' '}<b>{U.signOut.notKept}</b>{/if}
        </p>
        <div class="row"><button type="button" class="btn btn-secondary" onclick={openSignOut} data-testid="sign-out">{U.signOut.button}</button></div>
      </section>
    </div>
  {/if}
</div>

{#if picker}
  <PicturePicker tab={picker} {profile} onclose={() => (picker = null)} onsave={setPicture} />
{/if}

<dialog bind:this={importDlg} class="dlg" aria-labelledby="up-import-title" onclose={() => (pending = null)} data-testid="profile-import-dialog">
  <h2 id="up-import-title">{IMPORT.title}</h2>
  <p>{pending?.name}</p>
  <div class="choices">
    <button type="button" class="choice" onclick={() => applyImport('merge')} data-testid="import-merge"><b>{IMPORT.merge[0]}</b><span>{IMPORT.merge[1]}</span></button>
    <button type="button" class="choice" onclick={() => applyImport('replace')} data-testid="import-replace"><b>{IMPORT.replace[0]}</b><span>{IMPORT.replace[1]}</span></button>
  </div>
  <div class="dlg-acts"><button type="button" class="btn btn-secondary" onclick={() => importDlg?.close()}>{t.vf.saved.cancel}</button></div>
</dialog>

<style>
  .up { display: grid; gap: 24px; }
  .hidden { visibility: hidden; }
  .up-lead { font-size: 1.125rem; line-height: 1.6; color: var(--muted); }
  .up-note { padding: 12px 16px; border-radius: 14px; background: var(--tint); color: var(--ink); }
  .up-note.error { background: color-mix(in srgb, var(--act) 14%, transparent); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .col { display: grid; gap: 8px; }
  .hint { font-size: 0.875rem; }
  .muted { color: var(--muted); }

  .ways { display: grid; gap: 24px; }
  .way { display: grid; align-content: start; gap: 12px; padding: 24px; }
  .way.drag { box-shadow: 0 0 0 2px var(--accent); }
  .way .num { font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent); }
  .way h2, .box h2 { font-size: 1.125rem; font-weight: 700; }
  .way p, .box p { line-height: 1.6; color: var(--muted); }
  .drop { display: grid; place-items: center; gap: 8px; padding: 18px; border: 1.5px dashed var(--control); border-radius: 14px; color: var(--muted); font-size: 0.875rem; text-align: center; }

  .hero { display: flex; flex-wrap: wrap; align-items: center; gap: 20px 28px; padding: 24px; }
  .hero :global(.avatar) { font-size: 2.6rem; }
  .who { display: grid; flex: 1 1 16rem; gap: 10px; min-width: 0; }
  .name { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; overflow-wrap: anywhere; }
  .btn.small { min-height: 2.25rem; padding: 0 12px; font-size: 0.875rem; letter-spacing: 0; }
  .facts { font-family: var(--font-mono); font-size: 0.8125rem; color: var(--muted); }
  .name-form { display: grid; gap: 6px; }
  .name-form label { font-weight: 600; }
  .name-form input { flex: 1 1 12rem; min-width: 0; min-height: 44px; padding: 0 16px; border: 1px solid var(--control); border-radius: 9999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 1.125rem; }
  .name-form small { color: var(--muted); }

  .grid { display: grid; gap: 24px; }
  .box { display: grid; align-content: start; gap: 12px; padding: 24px; }
  .prov { display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 18px; border: 1px solid var(--control); border-radius: 16px; background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
  .prov:hover:not(:disabled) { background: var(--tint); }
  .prov:disabled { opacity: 0.6; cursor: progress; }
  .prov svg { width: 22px; height: 22px; }
  .status { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--tint); }
  .status .status-dot { width: 10px; height: 10px; }
  .status div { flex: 1 1 12rem; min-width: 0; }
  .status b { display: block; }
  .status span:not(.status-dot) { font-size: 0.875rem; color: var(--muted); }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-size: 0.875rem; }
  .kv dt { color: var(--muted); }
  .kv dd { overflow-wrap: anywhere; }

  .choices { display: grid; gap: 8px; margin-top: 12px; }
  .choice { display: grid; gap: 2px; padding: 12px 16px; border: 1px solid var(--control); border-radius: 14px; background: var(--surface); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .choice:hover { background: var(--tint); }
  .choice span { font-size: 0.875rem; color: var(--muted); }

  @media (min-width: 64rem) {
    .ways { grid-template-columns: repeat(3, 1fr); }
    .grid { grid-template-columns: 1fr 1fr; }
    .wide { grid-column: span 2; }
  }
</style>
