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
    viewfinder: 'Viewfinder',
    about: 'About',
    privacy: 'Privacy',
    skip: 'Skip to content',
    menu: 'Menu',
    menuLabel: 'Pages',
  },
  dock: {
    label: 'Page tools',
    open: 'Show page tools',
    pin: 'Keep page tools open',
    close: 'Hide page tools',
    onThisPage: 'On this page',
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
  vf: {
    tools: 'Viewfinder tools',
    panels: { camera: 'Camera', frame: 'Frame', lens: 'Lens', guides: 'Guides', info: 'Info' },
    close: 'Close panel',
    mode: { label: 'Mode', hint: 'Changes the presets and lens stops', cinema: 'Cinema', stills: 'Stills' },
    camera: { label: 'Camera', hint: 'Search by maker or model', format: 'Recording format', formatStills: 'Sensor format' },
    custom: { label: 'Custom sensor', hint: 'Your own size; kept until you reload the page', add: 'Add', name: 'Name', width: 'Width (mm)', height: 'Height (mm)', squeeze: 'Anamorphic squeeze', submit: 'Use this sensor', defaultName: 'My sensor' },
    picker: { title: 'Choose a camera', search: 'Search cameras', none: 'No camera matches your search.', close: 'Close', yours: 'Your sensors' },
    classes: {
      'medium-format': 'Medium format',
      'full-frame': 'Full frame',
      'super-35': 'Super 35',
      'aps-c': 'APS-C',
      'micro-four-thirds': 'Micro Four Thirds',
      'one-inch': '1-inch type',
      'super-16': 'Super 16',
      phone: 'Phone',
    },
    frame: { label: 'Aspect ratio', hint: 'The frame drawn inside the format', squeeze: 'Anamorphic squeeze', squeezeHint: 'For anamorphic lenses', spherical: 'None (spherical)' },
    lens: {
      label: 'Focal length',
      entry: 'Entry',
      entryHint: 'Real focal length or full-frame equivalent',
      actual: 'Actual',
      equivalent: 'FF equiv.',
      sliderHint: 'Each stop of zoom is the same slider distance',
      stops: 'Lens stops',
      stopsHint: 'A generic prime set; add your own',
      addLens: 'Add lens (mm)',
      shorter: 'Shorter focal length',
      longer: 'Longer focal length',
      openPanel: 'lens settings',
    },
    guides: {
      thirds: ['Rule of thirds', 'Two lines each way'],
      golden: ['Golden ratio', 'Lines at 38.2% and 61.8%'],
      centre: ['Centre mark', 'A small cross in the middle'],
      safe: ['Safe areas', 'Action and graphics safe, EBU R 95'],
      color: ['Frame lines', 'A colour that stands out on your scene'],
      mask: ['Mask strength', 'How much is dimmed outside the frame'],
      colors: { accent: 'Blue', amber: 'Amber', white: 'White', red: 'Red' },
    },
    info: {
      angle: ['Angle of view', 'Horizontal, vertical and diagonal of the frame'],
      crop: ['Crop factor', 'Diagonal of the recording area compared with full frame'],
      equivalent: ['Like full frame', 'Full-frame focal length with the same diagonal angle'],
      distance: ['Frame at distance', 'Subject distance in metres'],
      distanceInput: 'Subject distance in metres',
    },
    readout: { horizontal: 'H', vertical: 'V', diagonal: 'D', crop: 'Crop', likeFF: 'Like FF' },
  },
} as const;

export type Strings = typeof en;
export const t: Strings = en;
