/**
 * Tailwind CSS v3 configuration used to build the legacy stylesheet.
 *
 * The v3 compiler cannot read v4's CSS-first `@theme` configuration, so this
 * mirrors it: colors are converted from `oklch()` to sRGB (see `./theme.ts`),
 * and scales that v4 renamed (shadow, blur, radius) or made dynamic (spacing)
 * are recreated under their v4 names so the same classes produce the same
 * result.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import plugin from "tailwindcss-v3/plugin.js";
import { readCustomProperties, readFontFamilies, readPalette, readSemanticColors, rgbSlashToComma } from "./theme";

/** e.g. the `--shadow-*` and `--blur-*` scales, with their bare defaults. */
function readScale(file: string, prefix: string): Record<string, string> {
  const css = readFileSync(file, "utf8");
  const scale: Record<string, string> = {};

  for (const [name, value] of Object.entries(readCustomProperties(css, /([\s\S]*)/))) {
    if (name === prefix) scale.DEFAULT = rgbSlashToComma(value);
    else if (name.startsWith(`${prefix}-`)) scale[name.slice(prefix.length + 1)] = rgbSlashToComma(value);
  }

  return scale;
}

export function createLegacyConfig(rootDir: string) {
  const v4Theme = join(rootDir, "node_modules", "tailwindcss", "theme.css");
  const appCss = readFileSync(join(rootDir, "src", "app.css"), "utf8");
  const palette = readPalette(rootDir);
  const semantic = readSemanticColors(rootDir);
  const fonts = readFontFamilies(rootDir);
  const rootProperties = readCustomProperties(appCss, /:root\s*\{([\s\S]*?)\n\}/);

  // v4 spacing is dynamic (`calc(var(--spacing) * n)`) for every integer; v3
  // needs explicit keys. The default v3 scale already covers fractions, so
  // extending the integers is enough to keep dynamic-looking utilities working.
  const spacing = Object.fromEntries(Array.from({ length: 201 }, (_, index) => [index, `${index * 0.25}rem`]));

  const themeInline = readCustomProperties(appCss, /@theme inline\s*\{([\s\S]*?)\n\}/);
  const radii = Object.fromEntries(
    Object.entries(themeInline)
      .filter(([name]) => name.startsWith("radius-"))
      .map(([name, value]) => [name.slice("radius-".length), value])
  );
  if (rootProperties.radius) radii.DEFAULT = rootProperties.radius;

  const semanticColors = Object.fromEntries(
    Object.entries(semantic.root)
      .filter(([, value]) => value)
      .map(([name, value]) => [name, `rgba(var(--${name}-rgb), <alpha-value>)`])
  );

  // v4 renamed the shadow/blur scales (v3's `shadow-sm` is v4's `shadow-xs`, ...).
  const shadows = readScale(v4Theme, "shadow");
  const blur = readScale(v4Theme, "blur");

  return {
    content: [join(rootDir, "src/**/*.{svelte,html,ts,js}")],
    // v4's `dark` variant matches descendants of `.dark`. The class strategy in
    // v3 would emit `:is(.dark *)`, which old browsers cannot parse.
    darkMode: ["variant", ".dark &"] as ["variant", string],
    theme: {
      extend: {
        colors: { ...palette, ...semanticColors },
        fontFamily: fonts,
        spacing,
        minWidth: spacing,
        maxWidth: spacing,
        minHeight: spacing,
        maxHeight: spacing,
        opacity: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [index, `${index}%`])),
        borderRadius: radii,
        boxShadow: shadows,
        blur,
        // v4's bare `ring` is 1px and defaults to the text color; v3's is 3px blue.
        ringWidth: { DEFAULT: "1px", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" },
        ringColor: { DEFAULT: "currentColor" }
      }
    },
    plugins: [
      plugin(({ addUtilities }) => {
        // v4-only utilities used by the app. Values mirror the v4 output.
        addUtilities({
          ".outline-hidden": { outline: "2px solid transparent", "outline-offset": "2px" },
          ".field-sizing-content": { "field-sizing": "content" },
          // tw-animate-css classes used by the app, with the same values as v4.
          ".animate-in": { animation: "enter 0.15s ease 0s 1 normal none" },
          ".animate-out": { animation: "exit 0.15s ease 0s 1 normal none" },
          ".animate-caret-blink": { animation: "caret-blink 1.25s ease-out infinite" },
          ".fade-in-0": { "--tw-enter-opacity": "0" },
          ".fade-out-0": { "--tw-exit-opacity": "0" },
          ".zoom-in-95": { "--tw-enter-scale": "0.95" },
          ".zoom-out-95": { "--tw-exit-scale": "0.95" },
          ".slide-in-from-top-2": { "--tw-enter-translate-y": "-0.5rem" },
          ".slide-in-from-bottom-2": { "--tw-enter-translate-y": "0.5rem" },
          ".slide-in-from-left-2": { "--tw-enter-translate-x": "-0.5rem" },
          ".slide-in-from-right-2": { "--tw-enter-translate-x": "0.5rem" }
        });
      })
    ]
  };
}
