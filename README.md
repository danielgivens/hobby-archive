# Hobby Hot Sauce — Label Archive

Astro + Three.js + GSAP ScrollTrigger. Scroll down; the bottles travel sideways.

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static site in dist/
npm run deploy    # build + wrangler deploy to Cloudflare
```

## Deploying to Cloudflare

**Pages (Git integration):** connect the repo, framework preset *Astro*, build command
`npm run build`, output directory `dist`. Node comes from `.node-version` (22.22.2; Astro
7.4 needs at least 22.22). Cloudflare will log that it is skipping `wrangler.jsonc`; that file
is for the Workers route below and is harmless on Pages.

**Workers (static assets):** `npm run deploy`.

## Adding a sauce

1. Drop the print-resolution label (PNG/JPG/TIFF, any size or aspect ratio, transparency OK)
   in `print-originals/`. That folder is git-ignored, so keep your own copy of print files.
2. Run `npm run labels`. It writes a web-ready WebP (max 2048px, transparency kept) to
   `src/assets/labels/`, and only processes new or changed files.
3. Add a Markdown file in `src/content/sauces/`:

```md
---
name: Fuego
year: 2022
order: 2022.2          # optional; sorts the shelf (defaults to year)
heat: hot              # mild | medium | hot | extra hot (optional)
label: ../../assets/labels/fuego-2022.webp
labelHeight: 0.9       # 0.2–1, how tall the label sits on the bottle
sauceColor: "#e2380b"
capColor: "#4a0e6b"
ingredients: [Fermented Peppers, Brine, Salt]
draft: false
---
Description goes here (Markdown).
```

The label's width comes from the PNG's aspect ratio, so a tall label wraps a small arc and a
square one wraps further around the bottle. Labels too wide to fit are scaled down to leave a seam.

## How it's put together

| File | What it does |
|---|---|
| `src/content.config.ts` | Schema for a sauce. The contract the page relies on. |
| `src/lib/sauces.ts` | `getSauces()`: the one place data is read; also converts labels to ≤2048px WebP. |
| `src/pages/index.astro` | Page markup and name captions; passes sauce JSON to the client. |
| `src/scripts/bottle.ts` | Procedural bottle: glass, sauce, cap, wrapped label. |
| `src/scripts/shelf.ts` | Renderer, infinite looping scroll (ScrollTrigger + sticky track), snapping. |

## CMS

Content is plain Markdown today, so it works with any Git-based CMS as-is. To move to
Cloudflare's EmDash (Astro-native, runs on Workers + D1/R2), the plan is:

1. `npx astro add cloudflare` and switch `output` as needed in `astro.config.mjs`.
2. Recreate the fields from `src/content.config.ts` as an EmDash collection.
3. Change `getSauces()` in `src/lib/sauces.ts` to read from EmDash. The page and 3D code
   only consume `SauceForShelf`, so nothing else should need to change.
