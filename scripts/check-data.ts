// Validates the camera database and reference library. Exit 1 on any problem.
//   node scripts/check-data.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateDatabase } from '../src/data/validate.ts';

const root = process.cwd();
const dataDir = join(root, 'src', 'data');
const sensorDir = join(dataDir, 'sensors');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

// Every file under sensors/, at any depth, so a misplaced file is reported rather than ignored.
function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const rel = prefix + name;
    return statSync(join(dir, name)).isDirectory() ? walk(join(dir, name), `${rel}/`) : [rel];
  });
}

const sensorFiles = walk(sensorDir).map((path) => ({ path, data: readJson(join(sensorDir, path)) }));
const deviceDir = join(dataDir, 'devices');
const deviceFiles = walk(deviceDir).map((path) => ({ path, data: readJson(join(deviceDir, path)) }));

const errors = validateDatabase(
  sensorFiles,
  readJson(join(dataDir, 'makers.json')),
  readJson(join(root, 'src', 'references', 'references.json')),
  deviceFiles,
);

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  console.error(`\ncheck-data: ${errors.length} problem(s) in the camera database.`);
  process.exit(1);
}
console.log(`check-data: ${sensorFiles.length} sensors and ${deviceFiles.length} devices valid, every value cited.`);
