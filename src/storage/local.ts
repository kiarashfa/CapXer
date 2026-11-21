import { migrate } from './migrate.ts';
import { sanitizeSave } from './sanitize.ts';
import type { SaveAdapter, SaveFile } from './schema.ts';

// The save file in this browser's localStorage. Reads are also offered
// synchronously, so the viewfinder can restore before its first paint.

export { SAVE_KEY } from './schema.ts';
import { SAVE_KEY } from './schema.ts';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface LocalAdapter extends SaveAdapter {
  /** False in private modes or with site data blocked: saving lasts for this page only. */
  readonly available: boolean;
  read(): SaveFile | null;
  write(file: SaveFile): boolean;
  clear(): void;
}

export function localAdapter(store: Store | null = browserStorage(), key = SAVE_KEY): LocalAdapter {
  let available = false;
  try {
    if (store) {
      store.setItem(`${key}.probe`, '1');
      store.removeItem(`${key}.probe`);
      available = true;
    }
  } catch {
    available = false;
  }

  const read = (): SaveFile | null => {
    try {
      const text = store?.getItem(key);
      if (!text) return null;
      const m = migrate(JSON.parse(text));
      return m.ok ? sanitizeSave(m.doc) : null;
    } catch {
      return null;
    }
  };

  const write = (file: SaveFile): boolean => {
    if (!available || !store) return false;
    try {
      store.setItem(key, JSON.stringify(file));
      return true;
    } catch {
      // Quota or blocked mid-session: keep working for this page.
      available = false;
      return false;
    }
  };

  return {
    get available() {
      return available;
    },
    read,
    write,
    clear() {
      try {
        store?.removeItem(key);
      } catch {
        // Nothing stored or storage blocked.
      }
    },
    async load() {
      return read();
    },
    async save(file) {
      write(file);
    },
  };
}
