// Signing out of this browser (the profile menu and the profile page). Loaded on demand.

import { clearSave } from '../storage/store.ts';
import { t } from '../i18n/en.ts';
import { disconnect, sync } from './cloud.ts';
import { cloudState, PROVIDERS, unsaved } from './local.ts';

/**
 * Brings the cloud save up to date (when one is connected), disconnects it and
 * removes the save from this browser. Throws, removing nothing, when the cloud
 * could not be saved first.
 */
export async function signOut(): Promise<void> {
  const cloud = cloudState();
  if (cloud) {
    if (unsaved(cloud)) {
      try {
        await sync({ interactive: true });
      } catch (error) {
        const reason = error instanceof Error ? ` ${error.message}` : '';
        throw new Error(`${t.user.signOut.failed(PROVIDERS[cloud.provider])}${reason}`, { cause: error });
      }
    }
    await disconnect();
  }
  clearSave();
}
