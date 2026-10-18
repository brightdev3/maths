/**
 * Helpers for mirroring the Tailwind CSS v4 theme (CSS-first, defined in
 * `src/app.css` and `tailwindcss/theme.css`) into the Tailwind v3 configuration
 * used to build the legacy stylesheet.
 *
 * The only non-trivial part is colors: v4 defines every color with `oklch()`,
 * which old browsers cannot parse. They are converted to sRGB here (the same
 * gamut clipping v4 applies in its own `color-mix()` fallbacks), so the legacy
 * sheet can express them as plain rgb values.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ColorValue = {
  /** e.g. `#eef7e8` */
  hex: string;
  /** e.g. `238, 247, 232` (for `rgba(var(--x-rgb), <alpha-value>)`) */
  rgb: string;
};

/** Converts an `oklch()` color to sRGB. Matrices from Björn Ottosson's OKLab definition. */
export function oklchToColor(l: number, c: number, h: number): ColorValue {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3
  ];

  const channels = linear.map((value) => {
    const gamma = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, gamma)) * 255);
  });

  const hex = `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  return { hex, rgb: channels.join(", ") };
}

/** Parses a CSS color value: `oklch()` (any spacing/percent form) or hex. */
export function parseColor(value: string): ColorValue | undefined {
  const oklch = value.trim().match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i);
  if (oklch) {
    const l = parseFloat(oklch[1]) / (oklch[2] === "%" ? 100 : 1);
    return oklchToColor(l, parseFloat(oklch[3]), parseFloat(oklch[4]));
  }

  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const number = parseInt(hex[1], 16);
    const channels = [(number >> 16) & 255, (number >> 8) & 255, number & 255];
    return { hex: value.trim(), rgb: channels.join(", ") };
  }

  return undefined;
}

/** `rgb(0 0 0 / 0.1)` → `rgba(0, 0, 0, 0.1)`, for old browsers without space-separated rgb(). */
export function rgbSlashToComma(value: string): string {
  return value.replace(/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+%?)\s*\)/g, "rgba($1, $2, $3, $4)");
}

/** Reads the `--custom-property: value;` pairs of a CSS block. */
export function readCustomProperties(css: string, blockPattern: RegExp): Record<string, string> {
  const block = css.match(blockPattern)?.[1];
  if (!block) return {};

  const properties: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    properties[match[1]] = match[2].trim();
  }
  return properties;
}

/** The v4 default palette (`--color-red-500: oklch(...)`, ...) converted to sRGB. */
export function readPalette(rootDir: string): Record<string, Record<string, string>> {
  const theme = readFileSync(join(rootDir, "node_modules", "tailwindcss", "theme.css"), "utf8");
  const palette: Record<string, Record<string, string>> = {};

  for (const match of theme.matchAll(/--color-([a-z]+)-([\w]+)\s*:\s*(oklch\([^;]+\));/g)) {
    const [, name, shade, value] = match;
    const color = parseColor(value);
    if (!color) continue;
    palette[name] ??= {};
    palette[name][shade] = `rgba(${color.rgb}, <alpha-value>)`;
  }

  return palette;
}

/** The site's semantic colors from `src/app.css`, split into light (`:root`) and dark (`.dark`) values. */
export function readSemanticColors(rootDir: string) {
  const css = readFileSync(join(rootDir, "src", "app.css"), "utf8");
  const read = (pattern: RegExp) => {
    const properties = readCustomProperties(css, pattern);
    return Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, parseColor(value)]));
  };

  return {
    root: read(/:root\s*\{([\s\S]*?)\n\}/),
    dark: read(/\.dark\s*\{([\s\S]*?)\n\}/)
  };
}

/** The site's font stacks. */
export function readFontFamilies(rootDir: string): Record<string, string[]> {
  const css = readFileSync(join(rootDir, "src", "app.css"), "utf8");
  const read = (name: string) => {
    const match = css.match(new RegExp(`--font-${name}\\s*:\\s*([\\s\\S]*?);`));
    return match ? match[1].trim() : undefined;
  };

  const split = (value: string) => value.split(/,(?![^(]*\))/).map((part) => part.trim());
  const families: Record<string, string[]> = {};
  for (const name of ["sans", "display", "mono"]) {
    const value = read(name);
    if (value) families[name] = split(value);
  }

  return families;
}
