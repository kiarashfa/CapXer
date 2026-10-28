// Single source of truth for deployment and analytics settings.
// Imported by astro.config.ts, the app and the Node scripts. Keep it free of
// non-erasable TypeScript (no enums/namespaces) so Node can run it directly.

export const SITE_NAME = 'CapXer';

/** Origin the site is served from. */
export const SITE_ORIGIN = 'https://kiarashfa.github.io';

/**
 * Path the site lives under, with leading and trailing slash.
 * For a custom domain at the root, change this to '/' (and SITE_ORIGIN above).
 */
export const BASE_PATH = '/CapXer/';

export const REPO_URL = 'https://github.com/kiarashfa/CapXer';

/** GA4 measurement ID. Public by design; never put secrets in this repo. */
export const GA_MEASUREMENT_ID = 'G-W290FFPWK4';
