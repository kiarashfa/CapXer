// Events about the save file, fired on window in this tab only (other tabs see
// the localStorage write). A separate file so the site bar can listen without
// loading the save code. See src/storage/store.ts.

/** The save was just written (cloud auto-save and the profile circle listen). */
export const SAVE_EVENT = 'capxer:save';
/** Write pending changes now, before someone reads the save. */
export const FLUSH_EVENT = 'capxer:flush';
/** The save was changed outside the viewfinder (profile page, cloud, sign out); reload it. */
export const REPLACED_EVENT = 'capxer:replaced';
