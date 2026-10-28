import { BASE_PATH } from '../config/site.ts';

/**
 * Build an internal URL under the base path. Every internal link goes through
 * here, so moving to a custom domain stays a one-line change in config/site.ts.
 * Page paths get a trailing slash (the site uses trailingSlash: 'always');
 * file paths (anything with an extension) do not.
 */
export function url(path = '', base: string = BASE_PATH): string {
  const [, pathname = '', suffix = ''] = /^([^?#]*)(.*)$/.exec(path.replace(/^\/+/, '')) ?? [];
  if (pathname === '') return base + suffix;
  const isFile = /\.[a-z0-9]+$/i.test(pathname);
  const withSlash = isFile || pathname.endsWith('/') ? pathname : `${pathname}/`;
  return base + withSlash + suffix;
}
