import { getContext, setContext } from 'svelte';

// Things that move during the exposure (a fan) register a function here; the
// renderer calls each one with the moment inside the shutter time (seconds)
// before drawing a sample, so slow shutters smear them.

export type Mover = (seconds: number) => void;

const KEY = Symbol('lab-motion');

export function provideMotion(): Set<Mover> {
  const movers = new Set<Mover>();
  setContext(KEY, movers);
  return movers;
}

export function useMotion(): Set<Mover> | undefined {
  return getContext<Set<Mover> | undefined>(KEY);
}
