# Third-party software and data

CapXer builds on the work below. Each item keeps its own licence. The CapXer licence in [LICENSE](LICENSE) does not apply to these items.

## Software shipped to visitors

| Name | Use | Licence | Link |
|---|---|---|---|
| Svelte | Interactive components | MIT | https://github.com/sveltejs/svelte |

## Build and development tools

| Name | Use | Licence | Link |
|---|---|---|---|
| Astro | Site framework | MIT | https://github.com/withastro/astro |
| Tailwind CSS | Styling | MIT | https://github.com/tailwindlabs/tailwindcss |
| TypeScript | Type checking | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Vitest | Unit tests | MIT | https://github.com/vitest-dev/vitest |
| Playwright | Browser tests | Apache-2.0 | https://github.com/microsoft/playwright |
| axe-core | Accessibility tests | MPL-2.0 | https://github.com/dequelabs/axe-core |
| Zod | Data validation | MIT | https://github.com/colinhacks/zod |

## Services

| Name | Use | Terms |
|---|---|---|
| Google Analytics 4 | Visit statistics, only after consent | https://marketingplatform.google.com/about/analytics/terms/us/ |

## Data

No third-party dataset is included. The camera database in `src/data/` is CapXer's own: each sensor size is taken from the maker's published specifications or from a SMPTE standard, and every value cites its source in `src/references/references.json`. The sources are listed on the website's About page.

Datasets with their own licences (for example lensfun) will be listed here, with their required attributions, if they are added.

## Fonts

Served from CapXer itself (no third-party font server is contacted), packaged by Fontsource.

| Name | Use | Licence | Link |
|---|---|---|---|
| Figtree | Interface and reading text | SIL Open Font License 1.1 | https://github.com/erikdkennedy/figtree |
| JetBrains Mono | Numbers and measurements | SIL Open Font License 1.1 | https://github.com/JetBrains/JetBrainsMono |
| Fontsource | Font packaging | MIT | https://github.com/fontsource/fontsource |
