// The profile circle in the site bar (every page) and its menu, plus the
// sign-out question. Kept light: the save code, the cloud code and sign out
// load only when one of their actions is used.
// The menu is a disclosure (button + group of links and buttons), not an ARIA
// menu: Tab moves through it, Esc or a click outside closes it.

import { t } from '../i18n/en.ts';
import { url } from '../lib/url.ts';
import { REPLACED_EVENT, SAVE_EVENT } from '../storage/events.ts';
import {
  ago,
  CLOUD_EVENT,
  cloudDot,
  cloudState,
  paintAvatar,
  PROVIDERS,
  savedHead,
  type CloudState,
  type Dot,
} from './local.ts';

const U = t.user;

const ICONS = {
  user: '<circle cx="12" cy="9" r="4"/><path d="M4.5 20.5c1.5-3.8 4.3-5.5 7.5-5.5s6 1.7 7.5 5.5"/>',
  down: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  open: '<path d="M12 20V9M7.5 13.5 12 9l4.5 4.5M5 4h14"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5Z"/>',
  out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h10"/>',
};

/** What the cloud is doing in this tab right now (from CLOUD_EVENT). */
let live: { state: string; message?: string } = { state: 'idle' };

/** One line about where the save is: "Saved to Dropbox 2 min ago". */
export function statusText(s: CloudState | null, dot: Dot, now = Date.now()): string {
  if (!s) return U.localOnly;
  const p = PROVIDERS[s.provider];
  if (live.state === 'saving') return U.status.saving(p);
  if (dot === 'auth') return U.status.auth(p);
  if (s.problem === 'error') return U.status.error(p);
  if (dot === 'pending')
    return s.provider === 'google' && !(s.token && s.token.expires > now)
      ? `${U.status.pending(p)}. ${U.status.googleWait}`
      : U.status.pending(p);
  return U.status.saved(p, ago(s.syncedAt ?? s.savedAt, now));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

function item(
  kind: 'a' | 'button',
  icon: keyof typeof ICONS,
  label: string,
  attrs: Record<string, string> = {},
): HTMLElement {
  const e = el(kind, {
    class: 'pm-item',
    ...(kind === 'button' ? { type: 'button' } : {}),
    ...attrs,
  });
  e.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  e.append(label);
  return e;
}

/** Downloads the save file ("capxer-2026-11-21.json"). */
export async function downloadSave(): Promise<void> {
  const [{ readSave }, { exportName, exportText }] = await Promise.all([
    import('../storage/store.ts'),
    import('../storage/file.ts'),
  ]);
  const file = readSave();
  if (!file) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exportText(file)], { type: 'application/json' }));
  a.download = exportName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Asks before signing out of this browser (the menu and the profile page). */
export function openSignOut(): void {
  const dlg = document.getElementById('signout-dialog') as HTMLDialogElement | null;
  if (!dlg) return;
  const s = cloudState();
  const head = savedHead();
  const note = dlg.querySelector<HTMLElement>('[data-signout-note]')!;
  note.textContent = s ? U.signOut.kept(PROVIDERS[s.provider]) : head.work ? U.signOut.notKept : '';
  note.hidden = !note.textContent;
  dlg.querySelector<HTMLElement>('[data-signout-download]')!.hidden = !!s || !head.work;
  dlg.querySelector<HTMLElement>('[data-signout-error]')!.hidden = true;
  if (s?.provider === 'google') import('./cloud.ts').then((m) => m.loadGoogle()).catch(() => {});
  dlg.showModal();
}

function initSignOut(): void {
  const dlg = document.getElementById('signout-dialog') as HTMLDialogElement | null;
  if (!dlg) return;
  const confirm = dlg.querySelector<HTMLButtonElement>('[data-signout-confirm]')!;
  const error = dlg.querySelector<HTMLElement>('[data-signout-error]')!;
  dlg.querySelector('[data-signout-cancel]')!.addEventListener('click', () => dlg.close());
  dlg.querySelector('[data-signout-download]')!.addEventListener('click', () => downloadSave());
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    confirm.textContent = U.signOut.working;
    try {
      await (await import('./signout.ts')).signOut();
      dlg.close();
      try {
        sessionStorage.setItem('capxer.signedOut', '1');
      } catch {
        // The note after signing out is a nicety.
      }
      if (location.pathname !== url('user')) location.assign(url('user'));
      else dispatchEvent(new CustomEvent(REPLACED_EVENT));
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
    } finally {
      confirm.disabled = false;
      confirm.textContent = U.signOut.confirm;
    }
  });
}

export function initProfile(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-profile]');
  const menu = document.getElementById('profile-menu');
  if (!btn || !menu) return;
  const avatar = btn.querySelector<HTMLElement>('.avatar')!;
  const dotEl = btn.querySelector<HTMLElement>('.avatar-dot')!;

  const render = () => {
    const head = savedHead();
    const s = cloudState();
    const dot = cloudDot(s);
    const line = statusText(s, dot);
    const p = s ? PROVIDERS[s.provider] : '';

    const top = el('div', { class: 'pm-head' });
    const big = el('span', { class: 'avatar' });
    big.innerHTML = avatar.querySelector('.avatar-icon')!.outerHTML;
    paintAvatar(big, head.profile);
    const who = el('span');
    who.append(el('b', {}, head.profile?.name || (head.work ? U.circle : U.noProfile)));
    const small = el('small');
    if (dot)
      small.append(el('span', { class: 'status-dot', 'data-dot': dot, 'aria-hidden': 'true' }));
    small.append(line);
    who.append(small);
    top.append(big, who);

    const items: HTMLElement[] = [top];
    if (
      s &&
      dot === 'pending' &&
      s.provider === 'google' &&
      !(s.token && s.token.expires > Date.now())
    )
      items.push(
        item('button', 'cloud', U.menu.saveNow(p), {
          class: 'pm-item attention',
          'data-act': 'save',
        }),
      );
    if (s && dot === 'auth')
      items.push(
        item('button', 'cloud', U.menu.reconnect(p), {
          class: 'pm-item attention',
          'data-act': 'reconnect',
        }),
      );
    if (head.work) {
      items.push(item('a', 'user', U.menu.profile, { href: url('user') }));
      items.push(item('button', 'down', U.menu.download, { 'data-act': 'download' }));
      items.push(el('div', { class: 'pm-sep', 'aria-hidden': 'true' }));
      items.push(item('button', 'out', U.menu.signOut, { 'data-act': 'signout' }));
    } else {
      items.push(item('a', 'user', U.menu.setup, { href: url('user') }));
      items.push(item('a', 'open', U.menu.open, { href: `${url('user')}#open` }));
    }
    menu.replaceChildren(...items);
  };

  const paint = () => {
    const head = savedHead();
    const s = cloudState();
    const dot = cloudDot(s);
    paintAvatar(avatar, head.profile);
    dotEl.hidden = !dot;
    if (dot) dotEl.dataset.dot = dot;
    // Shown initials are part of the name (WCAG 2.5.3), so speech users can say what they see.
    const letters = !head.profile?.picture && head.profile?.initials?.letters;
    const label = `${U.circle}${head.profile?.name ? `, ${head.profile.name}` : ''}${letters ? `, ${U.initialsLabel(letters)}` : ''}. ${statusText(s, dot)}`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    if (!menu.hidden) render();
  };

  const setOpen = (open: boolean, focusButton = false) => {
    if (open) render();
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (focusButton) btn.focus();
    // Google's sign-in script must be ready before a click asks it for a window.
    if (open && cloudState()?.provider === 'google')
      import('./cloud.ts').then((m) => m.loadGoogle()).catch(() => {});
  };

  btn.addEventListener('click', () => setOpen(menu.hidden !== false));
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && !btn.contains(e.target as Node))
      setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) setOpen(false, true);
  });
  menu.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'download') {
      setOpen(false);
      await downloadSave();
    } else if (act === 'signout') {
      setOpen(false);
      openSignOut();
    } else if (act === 'save' || act === 'reconnect') {
      const cloud = await import('./cloud.ts');
      const s = cloudState();
      if (act === 'reconnect' && s?.provider === 'dropbox')
        return void cloud.connectDropbox().catch(() => {});
      cloud.sync({ interactive: true }).catch(() => {});
    }
  });

  addEventListener(CLOUD_EVENT, (e) => {
    const detail = (e as CustomEvent<{ state: string; message?: string } | undefined>).detail;
    if (detail) live = detail;
    paint();
  });
  addEventListener(SAVE_EVENT, paint);
  addEventListener(REPLACED_EVENT, paint);
  addEventListener('storage', paint);
  // Keep "2 min ago" true while the page is open.
  setInterval(() => !menu.hidden && render(), 30_000);
  paint();
  initSignOut();
}
