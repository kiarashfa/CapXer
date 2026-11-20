// robots.txt: allow everything, point to the sitemap.
// Crawlers only read robots.txt at the root of a host, so on the github.io
// subpath this file has no effect; it starts working with a custom domain
// (BASE_PATH '/'). Until then, submit the sitemap in Google Search Console.
import type { APIRoute } from 'astro';
import { SITE_ORIGIN } from '../config/site.ts';
import { url } from '../lib/url.ts';

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}${url('sitemap.xml')}\n`, {
    headers: { 'Content-Type': 'text/plain' },
  });
