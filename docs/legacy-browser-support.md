# Legacy browser support

Modern browsers get the Tailwind CSS v4 bundle, unchanged. Older browsers get `legacy.css`, a stylesheet built with **Tailwind CSS v3** from the same theme and source files, downleveled with Lightning CSS.

## Why

Tailwind CSS v4 needs cascade layers, `oklch()`, `color-mix()`, `@property` and `:where()`. The Tailwind docs list Chrome 111, Safari 16.4 and Firefox 128 as the baseline, and recommend staying on v3.4 for older browsers. The failure modes seen in practice:

- Browsers without cascade layers discard the entire v4 stylesheet, so the page is unstyled.
- Browsers with layers but without `oklch()` lose the theme colors.
- Browsers like **Pale Moon** support `oklch()`, `color-mix()` and `@layer`, but not `@property` or the individual `translate` property, so Tailwind v4 only partially applies and the page renders broken. Feature checks that only look for `oklch()` and `color-mix()` therefore hand the v4 bundle to browsers that cannot render it.

v3 output avoids all of the above: plain selectors, comma `rgba()` colors, `transform`, no layers, no `@property`.

Two more problems come from the engines themselves, and are handled by the legacy sheet:

- **No flexbox `gap`** (Firefox < 63, Chrome < 84, Safari < 14.1). The app pairs flex containers with `gap-*` everywhere, so all spacing would collapse.
- **No `:where()`** (Firefox < 78, Chrome < 88, Safari < 14). Tailwind v3 preflight and Svelte's scoped component styles emit `:where(...)`, and any rule with an unsupported selector is dropped whole.

## How it works

`bun run build` runs `vite build` and then `scripts/build-legacy-css.ts`.

1. **Theme** (`scripts/legacy/tailwind.config.ts`, `scripts/legacy/theme.ts`). The v4 palette and the site's semantic colors (`src/app.css`) are converted from `oklch()` to sRGB. v3 colors are written as `rgba(var(--name-rgb), <alpha-value>)`, so opacity modifiers work. The v4 shadow, blur and radius scales are recreated under their v4 names, spacing covers every integer, and `dark:` matches descendants of `.dark`, as in v4.
2. **Input** (`scripts/legacy/legacy.css`). `@tailwind base` and `@tailwind utilities`, the base rules and custom utilities from `src/app.css`, the animation classes that `tw-animate-css` provided in v4, and a few rules v3 cannot generate.
3. **Theme variables.** The build inserts `:root` and `.dark` blocks generated from `src/app.css`, with hex values and `--*-rgb` triplets, plus literal body colors for browsers without custom properties.
4. **Flex `gap` fallbacks.** The build scans its own output for the `gap-*` utilities in use and generates margin-based equivalents scoped to `html.no-flex-gap` (a class the inline script sets when its gap probe fails), with a second copy inside `@supports not (gap: 1px)` for engines that do not know `gap` at all and for JavaScript-disabled browsers. Children that carry their own margins (`ml-auto`, `mx-*`, ...) are excluded so they keep working, and column containers that become rows at a breakpoint (`sm:flex-row`) get axis-swapped rules inside the same media query.
5. **`:where()` flattening.** Single-argument `:where(...)`/`:is(...)` wrappers in the compiled CSS and the component styles are replaced with their contents.
6. **Downleveling.** Lightning CSS targets Chrome 49, Firefox 52, Safari 10 and Edge 15: static color syntax, vendor prefixes, `inset` expansion.
7. **Components** (production only). The scoped component stylesheets from the Vite build are downleveled and appended, so component styles apply too.

The output is `build/client/legacy.css`, with `.br` and `.gz` copies that adapter-node serves.

**Loading** (`src/app.html`). A `<link id="legacy-css">` follows `%sveltekit.head%`, so its unlayered rules win ties in the browsers that use it. An inline script removes the link before it applies, but only when **all** of the following are supported: `@layer`, `@property`, `oklch()`, `color-mix()`, `:where()` (through `CSS.supports("selector(:where(a))")`) and the individual `translate` property. Anything else keeps the fallback. There is no `@supports` wrapper, so browsers without `@supports` also get the sheet.

**Development.** `vite.config.ts` builds the sheet from source when the dev server starts, and rebuilds it (debounced) when files under `src/` or `scripts/legacy/` change. It serves the result at `/legacy.css`. Dev builds do not include component styles.

## Support matrix

| Browser                                                                      | Stylesheet                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| Chrome/Edge 111+, Firefox 128+, Safari 16.4+                                 | Tailwind v4 (the link is removed)            |
| Older browsers with custom properties (Chrome 49+, Safari 9.1+, Firefox 31+) | `legacy.css`                                 |
| Modern browsers with JavaScript disabled                                     | `legacy.css` applies alongside the v4 bundle |
| Browsers without custom properties                                           | Literal body colors and preflight only       |

With JavaScript disabled, the unlayered legacy rules take precedence over the v4 layers for the properties they set. In testing, the result matched the v4 layout, and colors differ by at most about 11/255 because of sRGB rounding.

## Known differences

- v3 preflight and v3 utilities are close to v4 but not identical. Shadows, blur and ring defaults are mapped to v4 values.
- `gap-*` fallbacks are skipped for combinations the app does not use (`inline-flex`, `flex-row-reverse`, `gap-x-*`/`gap-y-*` with wrapping).
- `:has()` variants (for example `has-[>svg]:px-3`) only apply where `:has()` is supported.
- Arbitrary values using `min()`/`clamp()` (for example `w-[min(34rem,calc(100vw-2rem))]`) are dropped by engines that do not support them.
- Browsers without CSS custom properties (Internet Explorer 11) get only the literal colors and preflight.
- The dev server does not include component styles.

## Testing

Verified against a production build (October 2026):

- **Pale Moon 35.0.1** (Goanna 6.9): reports `oklch()` and `color-mix()` support, but not `@property` or `translate`, so it keeps the stylesheet. Before the feature check was widened it removed the legacy sheet and rendered a malformed overlay; now the page renders correctly and the disclaimer dialog is centered.
- **Chromium 83.0.4103.0** (May 2020; no flexbox gap, no `:is()`/`:where()`): keeps the stylesheet and receives the `no-flex-gap` class. Probes measured 8px spacing for flex rows, columns, wrapping rows, and a column that becomes a row at the `sm` breakpoint, with `ml-auto` intact. Its JavaScript engine is too old for SvelteKit, so only the server-rendered markup is styled.
- **Chromium 89.0.4389.0** (before `oklch()`): keeps the stylesheet and uses native flex `gap` (`no-flex-gap` is not set), so spacing is not doubled.
- **Firefox 56.0.2** (November 2017): a feature probe confirmed no `@layer`, `oklch()`, `color-mix()`, flex `gap` or `:is()`/`:where()`, and the page rendered through the legacy sheet. The JavaScript-disabled case is covered by the `@supports not (gap: 1px)` copy.
- **Modern Chromium**: with JavaScript the link is removed, the inline script keeps `no-flex-gap` off, and spacing probes measure 8px. With JavaScript disabled the legacy sheet applies and the page still renders.

Useful checks on the generated file:

```sh
bun run build:legacy
grep -c "no-flex-gap" build/client/legacy.css                       # margin fallbacks
grep -c "@layer\|oklch(\|color-mix(" build/client/legacy.css        # only comments and @supports blocks
```

To preview the legacy look in a modern browser, run this in the DevTools console (it bypasses the v4 link removal):

```js
document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
  if (!link.href.includes("legacy.css")) link.remove();
});
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "/legacy.css";
document.head.append(link);
```

## Maintenance

- **The feature check** in `src/app.html` must list everything the v4 bundle needs. Check for `oklch()` and `color-mix()` alone is not enough: Pale Moon supports both and still cannot render v4. When Tailwind starts requiring something new, add it.
- **New v4-only utilities** need a v3 equivalent: add them to `addUtilities` in `scripts/legacy/tailwind.config.ts`, or write them in `scripts/legacy/legacy.css`. Variant-prefixed classes (`data-[state=open]:animate-in`) only work for utilities added through the plugin or generated by v3.
- **`gap-*` fallbacks are generated automatically** from the compiled CSS, so new spacing values are picked up. If new direction overrides are used (`md:flex-col`, `flex-row-reverse`, `inline-flex`, `gap-x-*`), extend `flexGapFallbacks` in `scripts/build-legacy-css.ts`.
- **Keep `scripts/legacy/legacy.css` free of** `@layer`, `oklch()`, `color-mix()` and `:is()`/`:where()`, so that it stays valid in old browsers.
- The Tailwind v3 package is installed as `tailwindcss-v3` (an npm alias of `tailwindcss@^3.4`), so it does not conflict with the v4 `tailwindcss` used by the app.
