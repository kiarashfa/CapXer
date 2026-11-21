// Cloud save: the save file kept as one file in the user's own Google Drive
// (the hidden app-data folder, scope drive.appdata) or Dropbox (the app's own
// folder), read and written straight from the browser with OAuth. There is no
// server in between; tokens stay in this browser (local.ts).
//
// A sync first checks the cloud file's version. When another device saved
// since this browser last looked, that copy is merged in (src/storage/sync.ts:
// newer edits win, deletions stay deleted) before anything new here is
// written back, so two devices never overwrite each other.
// Dropbox stays connected with a refresh token. Google gives browsers one-hour
// tokens only, so after an hour changes wait for a click.
// Loaded on demand (the viewfinder and the profile page, only when needed).

import { parseFile } from '../storage/file.ts';
import { FLUSH_EVENT, readSave, REPLACED_EVENT, SAVE_EVENT, writeSave } from '../storage/store.ts';
import { mergeSync, type SyncChanges } from '../storage/sync.ts';
import type { SaveFile } from '../storage/schema.ts';
import { url } from '../lib/url.ts';
import { t } from '../i18n/en.ts';
import { CLOUD_EVENT, cloudState, PROVIDERS, unsaved, writeJson, CLOUD_KEY, type CloudState, type Provider } from './local.ts';

const E = t.user.errors;
const FILE = 'capxer-save.json';
const GOOGLE_ID = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID ?? '';
const DROPBOX_KEY = import.meta.env.PUBLIC_DROPBOX_APP_KEY ?? '';
/** Which providers this build can offer (their ids come from the build environment). */
export const AVAILABLE: Record<Provider, boolean> = { google: !!GOOGLE_ID, dropbox: !!DROPBOX_KEY };

export class CloudError extends Error {
  /** The provider wants the user to sign in again. */
  auth: boolean;
  conflict: boolean;
  constructor(message: string, { auth = false, conflict = false } = {}) {
    super(message);
    this.auth = auth;
    this.conflict = conflict;
  }
}

export type SyncState = 'idle' | 'saving' | 'saved' | 'auth' | 'error';
export interface SyncStatus {
  state: SyncState;
  message?: string;
}

function announce(detail?: SyncStatus): void {
  dispatchEvent(new CustomEvent(CLOUD_EVENT, { detail }));
}

function persist(s: CloudState): void {
  writeJson(CLOUD_KEY, s);
  announce();
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const expiresAt = (seconds: unknown) => Date.now() + Math.max(60, (Number(seconds) || 3600) - 120) * 1000;

interface Remote {
  id?: string;
  rev: string;
}

interface Api {
  access(s: CloudState, interactive: boolean): Promise<CloudState>;
  account(s: CloudState): Promise<CloudState['account']>;
  stat(s: CloudState): Promise<Remote | null>;
  download(s: CloudState, remote: Remote): Promise<string>;
  upload(s: CloudState, body: string, remote: Remote | null): Promise<Remote>;
  revoke(s: CloudState): Promise<void>;
}

/* Google Drive ---------------------------------------------------------------------------- */

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}
interface GoogleOAuth {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    prompt: string;
    callback: (response: TokenResponse) => void;
    error_callback: (error: { type?: string }) => void;
  }): { requestAccessToken(): void };
  hasGrantedAllScopes(response: TokenResponse, scope: string): boolean;
  revoke(token: string, done: () => void): void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth } };
  }
}

// Google's sign-in script, loaded on first need. Load it before the click that
// asks for a token, or the browser may block the sign-in window.
let gis: Promise<GoogleOAuth> | null = null;
export function loadGoogle(): Promise<GoogleOAuth> {
  gis ??= new Promise((resolve, reject) => {
    const ready = window.google?.accounts?.oauth2;
    if (ready) return resolve(ready);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new CloudError(E.googleStart));
    };
    script.onerror = () => {
      gis = null;
      reject(new CloudError(E.googleLoad));
    };
    document.head.append(script);
  });
  return gis;
}

// A one-hour access token. `prompt` '' lets Google skip screens the user already
// agreed to; 'select_account' asks which account to use.
async function googleToken(prompt: string): Promise<CloudState['token']> {
  const oauth2 = await loadGoogle();
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_ID,
      scope: GOOGLE_SCOPE,
      prompt,
      callback: (r) => {
        if (r.error) return reject(new CloudError(E.googleUnfinished, { auth: true }));
        if (!oauth2.hasGrantedAllScopes(r, GOOGLE_SCOPE)) return reject(new CloudError(E.googleScope, { auth: true }));
        resolve({ access: r.access_token, expires: expiresAt(r.expires_in) });
      },
      error_callback: (e) => reject(new CloudError(e?.type === 'popup_closed' ? E.googleClosed : E.googlePopup, { auth: true })),
    });
    client.requestAccessToken();
  });
}

async function gfetch(s: CloudState, address: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(address, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${s.token?.access}` } });
  if (res.status === 401) throw new CloudError(E.googleAgain, { auth: true });
  if (!res.ok) throw new CloudError(E.failed(PROVIDERS.google, res.status));
  return res;
}

const google: Api = {
  async access(s, interactive) {
    if (s.token?.access && s.token.expires > Date.now()) return s;
    if (!interactive) throw new CloudError(E.googleClick, { auth: true });
    return { ...s, token: await googleToken('') };
  },
  async account(s) {
    const r = (await (await gfetch(s, `${DRIVE}/about?fields=user(displayName,emailAddress)`)).json()) as { user?: { displayName?: string; emailAddress?: string } };
    return { name: r.user?.displayName ?? '', email: r.user?.emailAddress ?? '' };
  },
  async stat(s) {
    const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
    const r = (await (await gfetch(s, `${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,version)&pageSize=1`)).json()) as { files?: { id: string; version: string }[] };
    const f = r.files?.[0];
    return f ? { id: f.id, rev: String(f.version) } : null;
  },
  async download(s, remote) {
    return (await gfetch(s, `${DRIVE}/files/${remote.id}?alt=media`)).text();
  },
  async upload(s, body, remote) {
    let res: Response;
    if (remote) {
      res = await gfetch(s, `${DRIVE_UPLOAD}/files/${remote.id}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    } else {
      const boundary = `capxer-${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;
      const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
      res = await gfetch(s, `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,version`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
      });
    }
    const r = (await res.json()) as { id: string; version: string };
    return { id: r.id, rev: String(r.version) };
  },
  async revoke(s) {
    const token = s.token;
    if (!token?.access || token.expires <= Date.now()) return;
    const oauth2 = await loadGoogle();
    await new Promise<void>((done) => oauth2.revoke(token.access, done));
  },
};

/* Dropbox --------------------------------------------------------------------------------- */
// OAuth code flow with PKCE (no app secret in a static site): the user goes to
// Dropbox and comes back to /user/ with a code, which finishDropbox() trades for
// a refresh token.

const DBX_AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize';
const DBX_TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const DBX_API = 'https://api.dropboxapi.com/2';
const DBX_CONTENT = 'https://content.dropboxapi.com/2';
const DBX_PATH = `/${FILE}`;
const PKCE_KEY = 'capxer.dropboxPkce';
/** Must match a redirect URI registered with the Dropbox app exactly. */
export const redirectUri = () => new URL(url('user'), location.origin).href;

interface DropboxToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

async function dropboxToken(params: Record<string, string>): Promise<DropboxToken & { access_token: string }> {
  const res = await fetch(DBX_TOKEN, { method: 'POST', body: new URLSearchParams({ client_id: DROPBOX_KEY, ...params }) });
  const r = (await res.json().catch(() => ({}))) as DropboxToken;
  if (!res.ok || !r.access_token) throw new CloudError(E.dropboxAgain, { auth: true });
  return { ...r, access_token: r.access_token };
}

async function dfetch(s: CloudState, address: string, { arg, body, json }: { arg?: unknown; body?: string; json?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${s.token?.access}` };
  if (arg) headers['Dropbox-API-Arg'] = JSON.stringify(arg);
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  else if (body !== undefined) headers['Content-Type'] = 'application/octet-stream';
  const res = await fetch(address, { method: 'POST', headers, body: json !== undefined ? JSON.stringify(json) : (body ?? null) });
  if (res.status === 401) throw new CloudError(E.dropboxAgain, { auth: true });
  return res;
}
const dropboxFailed = (res: Response) => new CloudError(E.failed(PROVIDERS.dropbox, res.status));

const dropbox: Api = {
  async access(s) {
    if (s.token?.access && s.token.expires > Date.now()) return s;
    if (!s.refresh) throw new CloudError(E.dropboxAgain, { auth: true });
    const r = await dropboxToken({ grant_type: 'refresh_token', refresh_token: s.refresh });
    return { ...s, token: { access: r.access_token, expires: expiresAt(r.expires_in) } };
  },
  async account(s) {
    const res = await dfetch(s, `${DBX_API}/users/get_current_account`);
    if (!res.ok) return null;
    const r = (await res.json()) as { name?: { display_name?: string }; email?: string };
    return { name: r.name?.display_name ?? '', email: r.email ?? '' };
  },
  async stat(s) {
    const res = await dfetch(s, `${DBX_API}/files/get_metadata`, { json: { path: DBX_PATH } });
    if (res.status === 409) return null; // not there yet
    if (!res.ok) throw dropboxFailed(res);
    return { rev: ((await res.json()) as { rev: string }).rev };
  },
  async download(s) {
    const res = await dfetch(s, `${DBX_CONTENT}/files/download`, { arg: { path: DBX_PATH } });
    if (!res.ok) throw dropboxFailed(res);
    return res.text();
  },
  async upload(s, body, remote) {
    // "update" only writes over the version this browser saw; anything newer
    // answers 409 and the sync starts over with that version merged in.
    const mode = remote ? { '.tag': 'update', update: remote.rev } : { '.tag': 'add' };
    const res = await dfetch(s, `${DBX_CONTENT}/files/upload`, { arg: { path: DBX_PATH, mode, autorename: false, mute: true }, body });
    if (res.status === 409) throw new CloudError(E.conflict, { conflict: true });
    if (!res.ok) throw dropboxFailed(res);
    return { rev: ((await res.json()) as { rev: string }).rev };
  },
  async revoke(s) {
    if (s.token?.access && s.token.expires > Date.now()) await dfetch(s, `${DBX_API}/auth/token/revoke`);
  },
};

const API: Record<Provider, Api> = { google, dropbox };

/* Connecting ------------------------------------------------------------------------------ */

/** Starts the Dropbox round trip (this page is left for Dropbox's). */
export async function connectDropbox(): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  try {
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  } catch {
    throw new CloudError(E.storage);
  }
  const q = new URLSearchParams({
    client_id: DROPBOX_KEY,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri(),
    token_access_type: 'offline',
    state,
  });
  location.assign(`${DBX_AUTHORIZE}?${q}`);
}

/** True when this page's address is Dropbox's answer to connectDropbox(). */
export function isDropboxReturn(): boolean {
  const params = new URLSearchParams(location.search);
  return params.has('state') && (params.has('code') || params.has('error'));
}

function takePkce(): { verifier: string; state: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null') as { verifier: string; state: string } | null;
    sessionStorage.removeItem(PKCE_KEY);
    return value;
  } catch {
    return null;
  }
}

/** On /user/: finishes connecting Dropbox from its answer in the address, then syncs. */
export async function finishDropbox(): Promise<SyncResult> {
  const params = new URLSearchParams(location.search);
  const pkce = takePkce();
  history.replaceState(history.state, '', location.pathname + location.hash);
  if (params.has('error')) throw new CloudError(params.get('error') === 'access_denied' ? E.dropboxDenied : E.dropboxUnfinished);
  if (!pkce || pkce.state !== params.get('state')) throw new CloudError(E.dropboxForeign);
  const r = await dropboxToken({ grant_type: 'authorization_code', code: params.get('code') ?? '', code_verifier: pkce.verifier, redirect_uri: redirectUri() });
  return connected({ provider: 'dropbox', refresh: r.refresh_token ?? null, token: { access: r.access_token, expires: expiresAt(r.expires_in) } });
}

export async function connectGoogle(): Promise<SyncResult> {
  const token = await googleToken('select_account');
  return connected({ provider: 'google', token });
}

async function connected(base: Pick<CloudState, 'provider' | 'token'> & Partial<CloudState>): Promise<SyncResult> {
  const prev = cloudState();
  if (prev && prev.provider !== base.provider) await disconnect();
  const s: CloudState = { account: null, savedAt: null, rev: null, file: null, refresh: null, problem: null, ...base };
  s.account = await API[s.provider].account(s).catch(() => null);
  persist(s);
  startAutoSave();
  return sync({ interactive: true });
}

/** Asks the provider to end this browser's access (best effort). */
export async function revoke(s: CloudState): Promise<void> {
  await API[s.provider].revoke(s).catch(() => {});
}

/** Forgets the connection here and revokes the token. The cloud file stays. */
export async function disconnect(): Promise<void> {
  const s = cloudState();
  writeJson(CLOUD_KEY, null);
  announce({ state: 'idle' });
  if (s) await revoke(s);
}

/* Saving ---------------------------------------------------------------------------------- */

/** What a sync brought in from the cloud, or null when nothing came in. */
export interface SyncResult {
  changes: SyncChanges | null;
}

let running: Promise<SyncResult> | null = null;

/**
 * Brings the cloud copy and this browser together: merges the cloud copy in
 * when another device saved since this browser last looked, then uploads if
 * anything here is new.
 */
export function sync(options?: { interactive?: boolean }): Promise<SyncResult> {
  running ??= run(options).finally(() => (running = null));
  return running;
}

const serialize = (file: SaveFile) => `${JSON.stringify(file, null, 2)}\n`;

async function run({ interactive = false, retry = true } = {}): Promise<SyncResult> {
  let s = cloudState();
  if (!s) return { changes: null };
  // Google's hour is over: changes wait (amber dot) for a click instead of an error.
  if (!interactive && s.provider === 'google' && !(s.token && s.token.expires > Date.now())) {
    announce({ state: 'idle' });
    return { changes: null };
  }
  const api = API[s.provider];
  announce({ state: 'saving' });
  try {
    s = await api.access(s, interactive);
    const remote = await api.stat(s);
    dispatchEvent(new CustomEvent(FLUSH_EVENT));
    const hadNew = unsaved(s) || !s.savedAt;
    let changes: SyncChanges | null = null;
    if (remote && remote.rev !== s.rev) {
      const parsed = parseFile(await api.download(s, remote));
      if (!parsed.ok) throw new CloudError(parsed.reason === 'newer' ? E.newer : E.unreadable(PROVIDERS[s.provider], FILE));
      // Read, merge and write in one synchronous step, so no change made meanwhile is lost.
      dispatchEvent(new CustomEvent(FLUSH_EVENT));
      const mine = readSave();
      const merged = mergeSync(mine, parsed.file);
      const written = writeSave(merged.file, mine);
      if (!written) throw new CloudError(E.storage);
      dispatchEvent(new CustomEvent(REPLACED_EVENT));
      changes = merged.changes;
      s = { ...s, rev: remote.rev, file: remote.id ?? s.file, savedAt: hadNew ? s.savedAt : written.savedAt };
    }
    const current = readSave();
    if (current && (!remote || hadNew)) {
      const saved = await api.upload(s, serialize(current), remote);
      s = { ...s, rev: saved.rev, file: saved.id ?? s.file, savedAt: current.savedAt };
    }
    persist({ ...s, problem: null, syncedAt: new Date().toISOString() });
    announce({ state: 'saved' });
    return { changes };
  } catch (error) {
    const err = error instanceof CloudError ? error : new CloudError(E.generic);
    if (err.conflict && retry) return run({ interactive, retry: false });
    // Keep a refreshed token even when the save itself failed.
    const latest = cloudState();
    if (latest) persist({ ...latest, token: s?.token ?? latest.token, problem: err.auth ? 'auth' : 'error' });
    announce({ state: err.auth ? 'auth' : 'error', message: err.message });
    throw err;
  }
}

/**
 * Saves a few seconds after each change and when the page is hidden. Google
 * past its hour leaves the changes waiting (amber dot) until a click.
 */
let started = false;
export function startAutoSave(): void {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const kick = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const s = cloudState();
      if (s && unsaved(s) && s.problem !== 'auth') sync().catch(() => {});
    }, delay);
  };
  addEventListener(SAVE_EVENT, () => {
    announce();
    kick(4000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') kick(0);
  });
  // A save from another device shows up when a page that edits opens.
  if (cloudState()?.problem !== 'auth') sync().catch(() => {});
}
