// Fails (exit 1) if an em-dash appears in user-facing text.
//   node scripts/check-emdash.ts         -> source, public files and public docs
//   node scripts/check-emdash.ts --dist  -> built site (all rendered text, meta, alt)
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { CODE_EXTENSIONS, findEmDashes } from './emdash.ts';

const root = process.cwd();
const dist = process.argv.includes('--dist');

const SOURCE_DIRS = ['src', 'public'];
const SOURCE_FILES = ['README.md', 'THIRD_PARTY.md', 'LICENSE'];
const SOURCE_EXT = new Set([...CODE_EXTENSIONS, '.md', '.mdx', '.json', '.html', '.svg', '.txt', '.webmanifest', '.yml', '.yaml']);
// Built JS is skipped: third-party library strings are not ours to police, and our strings are covered in source.
const DIST_EXT = new Set(['.html', '.xml', '.json', '.webmanifest', '.txt', '.svg']);

function walk(dir: string, exts: Set<string>, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

const files = dist
  ? walk(join(root, 'dist'), DIST_EXT)
  : [...SOURCE_DIRS.flatMap((d) => walk(join(root, d), SOURCE_EXT)), ...SOURCE_FILES.map((f) => join(root, f)).filter((f) => existsSync(f))];

if (dist && files.length === 0) {
  console.error('check-emdash: dist/ is empty. Run the build first.');
  process.exit(1);
}

let count = 0;
for (const file of files) {
  const code = !dist && CODE_EXTENSIONS.has(extname(file).toLowerCase());
  for (const hit of findEmDashes(readFileSync(file, 'utf8'), { code })) {
    count++;
    console.error(`${relative(root, file)}:${hit.line}:${hit.col}  ${hit.text.slice(0, 120)}`);
  }
}

if (count > 0) {
  console.error(`\ncheck-emdash: ${count} em-dash(es) found in user-facing text. Use a comma, colon, en-dash for ranges, or rephrase.`);
  process.exit(1);
}
console.log(`check-emdash: ${files.length} ${dist ? 'built' : 'source'} files clean.`);
