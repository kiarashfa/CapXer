import type { SubjectDef } from '../types.ts';

// Things to photograph, shared by every set (a set lists the ones that fit it).
// Each subject's 3D component loads with import() only when it is chosen, so
// a heavy model (a human, an animal) costs nothing until someone picks it.

export const SUBJECTS: SubjectDef[] = [
  {
    id: 'figure',
    name: 'Figure',
    height: 1.75,
    focusHeight: 1.6,
    radius: 0.25,
    load: () => import('./figure/Figure.svelte'),
  },
];

export function getSubject(id: string | undefined): SubjectDef {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0]!;
}
