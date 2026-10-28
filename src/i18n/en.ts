// All user-facing UI strings live here so more languages can be added later.
// Rule: no em-dashes in any string (checked by scripts/check-emdash.ts).

export const en = {
  site: {
    name: 'CapXer',
    tagline: "A director's viewfinder in your browser",
    description:
      "CapXer is a free director's viewfinder in your browser. Pick a sensor, aspect ratio and focal length, and see the frame on your phone or webcam.",
  },
  nav: {
    label: 'Main',
    home: 'Viewfinder',
    about: 'About',
    privacy: 'Privacy',
    skip: 'Skip to content',
  },
  theme: {
    toLight: 'Switch to light theme',
    toDark: 'Switch to dark theme',
    toggle: 'Toggle theme',
  },
  consent: {
    title: 'Analytics',
    body: 'May CapXer use Google Analytics to count visits? It sets cookies and only runs if you agree. Your camera feed never leaves your device either way.',
    accept: 'Allow analytics',
    decline: 'Decline',
    more: 'Privacy details',
    settings: 'Privacy settings',
  },
  footer: {
    source: 'Source code',
    licence: 'Source-available licence',
  },
} as const;

export type Strings = typeof en;
export const t: Strings = en;
