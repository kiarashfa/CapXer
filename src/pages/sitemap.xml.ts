// sitemap.xml for search engines: every public page, lessons with their "updated" date.
// The 404 page is left out on purpose. A new top-level page must be added to PAGES
// (tests/e2e/site.spec.ts checks that every built page is listed).
import type { APIRoute } from 'astro';
import { SITE_ORIGIN } from '../config/site.ts';
import { url } from '../lib/url.ts';
import { getLessons, lessonUrl } from '../content/lessons.ts';

const PAGES = ['', 'viewfinder', 'lab', 'lessons', 'about', 'user'];

export const GET: APIRoute = async () => {
  const lessons = await getLessons();
  const entries = [
    ...PAGES.map((p) => ({ loc: SITE_ORIGIN + url(p) })),
    ...lessons.map((l) => ({
      loc: SITE_ORIGIN + lessonUrl(l.id),
      lastmod: l.data.updated.toISOString().slice(0, 10),
    })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc>${'lastmod' in e && e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
