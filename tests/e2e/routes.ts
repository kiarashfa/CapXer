import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist', import.meta.url));

/**
 * Every page in the build, as paths relative to the base URL ('./', 'about/', '404.html').
 * Read from dist/ so new pages are tested automatically without editing any list.
 */
export function builtRoutes(): string[] {
  if (!existsSync(DIST)) throw new Error('dist/ not found. Run `npm run build` before the browser tests.');
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '_astro') walk(p);
      } else if (name === 'index.html') {
        const rel = relative(DIST, dir).split(sep).join('/');
        routes.push(rel ? `${rel}/` : './');
      } else if (name === '404.html') {
        routes.push('404.html');
      }
    }
  };
  walk(DIST);
  return routes.sort();
}
