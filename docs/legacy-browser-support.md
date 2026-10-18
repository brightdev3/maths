# Legacy browser support

The site ships two stylesheets built from the same Tailwind CSS v4 source:

- the regular Vite/Tailwind bundle, and
- `legacy.css`, a flattened and downlevelled fallback for older browsers.

Both are served from every production build; each browser applies exactly one of them.
Modern browsers keep the untouched Tailwind v4 output.

## Why this is needed

Tailwind CSS v4 is built for the "Baseline 2023" feature set:

- **Cascade layers** (Chrome 99, Safari 15.4, Firefox 97): every Tailwind style lives inside `@layer` blocks.
  Browsers without layer support discard the whole stylesheet along with the unknown at-rules,
  which is why old browsers showed the site completely unstyled.
- **`oklch()`** (Chrome 111, Safari 15.4, Firefox 113): the theme colors are defined in `oklch()`.
- **`color-mix()`** (Chrome 111, Safari 16.2, Firefox 113): opacity modifiers such as `bg-primary/50`
  are generated with `color-mix()`.

Tailwind v4.3 already emits its own fallbacks for `color-mix()` (a static color followed by an
`@supports` upgrade) and for `@property` (initial values applied through the `@layer properties` block),
but it cannot fall back for `@layer` or `oklch()`. Browsers that lack those features receive declarations
they drop, so colors and layout collapse. The legacy sheet covers exactly those gaps.

## How it works

Build step: `bun run build` runs `vite build` followed by `bun run build:legacy`.
[`scripts/build-legacy-css.ts`](../scripts/build-legacy-css.ts):

1. collects every `.css` asset from `build/client` — the Tailwind bundle and all Svelte component styles,
2. unwraps `@layer` blocks in place (the build emits them in layer order, so hoisting them preserves
   the cascade the layers expressed),
3. rewrites `translate` / `rotate` / `scale` onto a single `transform` declaration, because Lightning CSS
   does not downlevel the individual transform properties that Chrome < 104 / Safari < 14.1 lack,
4. runs Lightning CSS on each sheet targeting Chrome 62 / Firefox 56 / Safari 11 / Edge 18: colors get
   hex/rgb fallbacks, `inset`/logical properties/`:where()`/`@media` range syntax are rewritten and vendor
   prefixes are added,
5. concatenates the sheets (global Tailwind sheet first), wraps the file in
   `@supports not ((color: oklch(0 0 0)) and (color: color-mix(in srgb, red, blue))) { ... }` and writes
   `build/client/legacy.css` together with `.br`/`.gz` copies so adapter-node serves it pre-compressed.

Loading (`src/app.html`): a `<link id="legacy-css">` is placed after `%sveltekit.head%`, so in the
browsers that need it the unlayered fallback rules win same-specificity ties against the page/component
stylesheets. Two independent guards decide whether it applies:

- an inline script removes the link before it applies when the browser reports support for both `oklch()`
  and `color-mix()` (this also avoids downloading the file on modern browsers), and
- the `@supports` wrapper keeps the sheet inert when JavaScript is disabled or the script is blocked.

## Support matrix

| Browser                                                    | What it gets                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Chrome/Edge 111+, Firefox 113+, Safari 16.2+               | Tailwind v4 bundle (fallback link removed, never downloaded)   |
| Chrome 99–110, Firefox 97–112, Safari 15.4–16.1            | Legacy sheet (modern bundle lacks `oklch`/`color-mix` support) |
| Chrome 62–98, Firefox 56–96, Safari 11–15.3, Edge 18+      | Legacy sheet only (modern bundle is discarded entirely)        |
| Older than the above or no `@supports` support (e.g. IE11) | Unsupported: server-rendered HTML renders without styles       |

CSS compatibility reaches back to 2017-era browsers. JavaScript support is unchanged by this work: the
app bundle still targets the tooling baseline, so very old browsers may receive a styled but
non-interactive page, and some modern-only utilities (`aspect-ratio`, `field-sizing`, flex `gap` on
really old engines) degrade the same way they always did.

## Testing

- `bun run build` regenerates the artifact; `bun server.ts` serves the production build on port 5185.
- Sanity checks on the artifact:
  - `grep -c "@layer" build/client/legacy.css` reports `0`,
  - no bare `oklch(` outside the banner comment and the `@supports` condition,
  - the artifact is ~160 kB raw / ~29 kB gzip / ~24 kB brotli.
- Verified end-to-end (2026-10) with real old browsers against a production build:
  - Firefox 78.15.0esr (2020) — renders the homepage, 24 Game and Mathex pages fully styled,
  - Chromium 89.0.4389.0 (2021) — keeps the fallback link, applies it, colors resolve to the
    downlevelled `rgb()` values,
  - modern Chromium — removes the link with JavaScript enabled, and keeps the Tailwind v4 `oklch()`
    colors when JavaScript is disabled.
- The dev server serves the last generated `/legacy.css` (see the middleware in `vite.config.ts`), so
  old-browser checks work locally right after a build.

To preview the legacy look in a modern browser, run this in the DevTools console (it deliberately
bypasses the feature-query wrapper):

```js
document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
  if (!link.href.includes("legacy.css")) link.remove();
});
const css = await (await fetch("/legacy.css")).text();
const style = document.createElement("style");
style.textContent = css.replace(/^[\s\S]*?@supports[^{]*\{/, "").replace(/\}\s*$/, "");
document.head.append(style);
```

## Maintenance

- Generated files live in `build/` and are never committed; CI and the Docker build create them through
  `bun run build` (the Dockerfile copies `scripts/` into the build stage for this reason).
- If a future Tailwind release introduces new old-browser-breaking output, extend
  `scripts/build-legacy-css.ts` (add a PostCSS rewrite) or lower `LEGACY_TARGETS`.
- Keep the two guards in sync: the `CSS.supports()` check in `src/app.html` and the `@supports`
  condition wrapping `legacy.css` must test the same features, otherwise some browsers either download
  an inert stylesheet or keep applying the wrong one.
