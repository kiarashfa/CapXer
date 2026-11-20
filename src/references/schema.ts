import { z } from 'zod';

// The subset of CSL-JSON (https://citationstyles.org) that CapXer's reference
// library uses. One library serves both the camera database and the lessons.

const datePartsSchema = z.strictObject({
  'date-parts': z.array(z.array(z.int()).min(1).max(3)).length(1),
});

const namesSchema = z.array(
  z.union([z.strictObject({ family: z.string().min(1), given: z.string().optional() }), z.strictObject({ literal: z.string().min(1) })]),
).min(1);

export const ReferenceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  type: z.enum(['webpage', 'standard', 'book', 'article-journal', 'report', 'chapter', 'motion_picture']),
  title: z.string().min(1),
  author: namesSchema.optional(),
  editor: namesSchema.optional(),
  'container-title': z.string().min(1).optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  page: z.string().optional(),
  edition: z.string().optional(),
  publisher: z.string().min(1).optional(),
  'publisher-place': z.string().optional(),
  number: z.string().optional(),
  issued: datePartsSchema.optional(),
  DOI: z.string().regex(/^10\.\d{4,9}\/\S+$/).optional(),
  URL: z.url().optional(),
  accessed: datePartsSchema.optional(),
});

export type Reference = z.infer<typeof ReferenceSchema>;
