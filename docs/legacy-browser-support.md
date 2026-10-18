# Legacy browser support

Modern browsers get the Tailwind CSS v4 bundle, unchanged. Older browsers get `legacy.css`, a stylesheet built with **Tailwind CSS v3** from the same theme and source files, then downleveled with Lightning CSS.

## Why

Tailwind CSS v4 needs cascade layers, `oklch()`, `color-mix()` and `@property`. The Tailwind docs list Chrome 111, Safari 16.4 and Firefox 128 as the baseline, and recommend staying on v3.4 for older browsers.

- Browsers without cascade layers discard the entire v4 stylesheet, so the page is unstyled.
- Browsers with layers but without `oklch()` lose the theme colors.

An earlier approach downleveled the v4 output itself. That still left `:is()`, `:where()` and `var(--x,)` selectors that old browsers drop, and it wrapped the sheet in `@supports`, which excluded browsers without that feature. v3 output avoids all of these: it uses plain selectors, comma `rgba()` colors, `transform`, and no layers.

## How it works

`bun run build` runs `vite build` and then `scripts/build-legacy-css.ts`.

1. **Theme** (`scripts/legacy/tailwind.config.ts`, `scripts/legacy/theme.ts`). The v4 palette (`node_modules/tailwindcss/theme.css`) and the site's semantic colors (`src/app.css`) are converted from `oklch()` to sRGB. v3 colors are written as `rgba(var(--name-rgb), <alpha-value>)`, so opacity modifiers work. The v4 shadow, blur and radius scales are recreated under their v4 names, spacing covers every integer, and `dark:` matches descendants of `.dark`, as in v4.
2. **Input** (`scripts/legacy/legacy.css`). `@tailwind base` and `@tailwind utilities`, the base rules and custom utilities from `src/app.css`, the animation classes that `tw-animate-css` provided in v4, and a few rules v3 cannot generate (the `*:[span]:last:*` child variants).
3. **Theme variables.** The build inserts `:root` and `.dark` blocks generated from `src/app.css`, with hex values and `--*-rgb` triplets. It also adds literal body colors for browsers without custom properties.
4. **Downleveling.** Lightning CSS targets Chrome 49, Firefox 52, Safari 10 and Edge 15. It converts remaining static color syntax, adds prefixes and expands `inset`.
5. **Components** (production only). The scoped component stylesheets from the Vite build are downleveled and appended, so component styles apply too.

The output is `build/client/legacy.css`, with `.br` and `.gz` copies that adapter-node serves.

**Loading** (`src/app.html`). A `<link id="legacy-css">` follows `%sveltekit.head%`, so its unlayered rules win ties in the browsers that use it. An inline script removes the link before it applies when `CSS.supports()` reports both `oklch()` and `color-mix()`, so modern browsers never load it. There is no `@supports` wrapper, so browsers without `@supports` also get the sheet.

**Development.** `vite.config.ts` builds the sheet from source when the dev server starts, and rebuilds it (debounced) when files under `src/` or `scripts/legacy/` change. It serves the result at `/legacy.css`. Dev builds do not include component styles.

## Support matrix

| Browser                                                                      | Stylesheet                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| Chrome/Edge 111+, Firefox 113+, Safari 16.2+                                 | Tailwind v4 (the link is removed)            |
| Older browsers with custom properties (Chrome 49+, Safari 9.1+, Firefox 31+) | `legacy.css`                                 |
| Modern browsers with JavaScript disabled                                     | `legacy.css` applies alongside the v4 bundle |
| Browsers without custom properties                                           | Literal body colors and preflight only       |

With JavaScript disabled, the unlayered legacy rules take precedence over the v4 layers for the properties they set. In testing, the result matched the v4 layout, and colors differ by at most about 11/255 because of sRGB rounding.

## Known differences

- v3 preflight and v3 utilities are close to v4 but not identical. Shadows, blur and ring defaults are mapped to v4 values.
- `:has()` variants (for example `has-[>svg]:px-3`) only apply where `:has()` is supported.
- Component styles appended to the production sheet can still contain `:where()` or `:is()` selectors, which the very oldest browsers drop.
- The dev server does not include component styles.

## Testing

Verified against a production build (October 2026):

- **Firefox 78.15.0esr** (2020): homepage, `/tools/24-game` and `/mathex` render styled.
- **Chromium 89.0.4389.0** (2021, before cascade layers and `oklch()`): homepage renders styled, the disclaimer dialog is centered, and colors resolve to the `rgb()` fallbacks.
- **Modern Chromium**: with JavaScript enabled, the link is removed and the v4 `oklch()` colors are used. With JavaScript disabled, the legacy base applies and the button width matches the JavaScript-enabled render.

Useful checks on the generated file:

```sh
bun run build:legacy
grep -c "@layer\|oklch(\|color-mix(" build/client/legacy.css   # only inside comments and @supports blocks
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

- New v4-only utilities in the source need a v3 equivalent: add them to `addUtilities` in `scripts/legacy/tailwind.config.ts`, or write them in `scripts/legacy/legacy.css`. Variant-prefixed classes (`data-[state=open]:animate-in`) only work for utilities added through the plugin or generated by v3.
- Keep `scripts/legacy/legacy.css` free of `@layer`, `oklch()`, `color-mix()` and `:is()`/`:where()`, so that it stays valid in old browsers.
- The Tailwind v3 package is installed as `tailwindcss-v3` (an npm alias of `tailwindcss@^3.4`), so it does not conflict with the v4 `tailwindcss` used by the app.
