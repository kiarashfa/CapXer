# CapXer

A free director's viewfinder in your browser.

Pick a sensor or film format, an aspect ratio and a focal length, and see the frame. Use your phone or webcam to check framing in a real location, with exposure aids. Short, cited lessons explain the ideas behind the tools.

**Website:** https://kiarashfa.github.io/CapXer/

CapXer is in early development.

## Privacy

The camera feed is processed on your device and never uploaded. There are no accounts and no ads. Analytics (Google Analytics 4) only runs if you allow it.

## Development

Requires Node.js 22.23 or newer.

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Build the static site into `dist/` |
| `npm run check` | Type check and text checks |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser and accessibility tests (build first) |
| `npm run ci` | Everything the CI runs |

## Licence

CapXer is **source-available, not open source**. You can read the code, but use is limited by the terms in [LICENSE](LICENSE). Third-party software and data are credited in [THIRD_PARTY.md](THIRD_PARTY.md).
