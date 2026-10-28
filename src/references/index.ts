import type { Reference } from './schema.ts';
import library from './references.json';

// Validated at build time (scripts/check-data.ts); typed here without shipping zod.
export const references = library as Reference[];

const byId = new Map(references.map((r) => [r.id, r]));

export function getReference(id: string): Reference | undefined {
  return byId.get(id);
}

export type { Reference } from './schema.ts';
