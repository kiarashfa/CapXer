import { BASE_PATH, SITE_NAME } from '../config/site.ts';
import { t } from '../i18n/en.ts';
import { url } from '../lib/url.ts';

// The installed app's manifest, built from the site config so the base path
// stays a one-line change. The app opens straight into the viewfinder.

export function GET() {
  const manifest = {
    id: BASE_PATH,
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: t.site.description,
    lang: 'en',
    start_url: url('viewfinder'),
    scope: BASE_PATH,
    display: 'standalone',
    background_color: '#10151d',
    theme_color: '#10151d',
    icons: [
      { src: url('icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: url('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: url('icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), { headers: { 'Content-Type': 'application/manifest+json' } });
}
