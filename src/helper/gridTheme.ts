// ── DataGrid template theming ────────────────────────────────────────────────
// Maps a generated-app *template palette* (the `preview` object the server ships
// with every UI theme — see gen-app-builder-server/src/agent/templates) onto the
// CSS variables the DataGrid and its embedded Mantine widgets read, so the grid
// can be re-skinned to match any template strictly (chrome + widgets), including
// forcing light/dark to match the template regardless of the builder's own theme.

import { createContext, useContext } from 'react';

/** The subset of a template `preview` palette the grid consumes. All optional so
 *  a partial palette still themes what it can (missing keys fall back to theme). */
export interface GridPalette {
  bg_page?: string;
  bg_card?: string;
  bg_surface?: string;
  bg_hover?: string;
  border?: string;
  primary?: string;
  text_primary?: string;
  text_secondary?: string;
  success?: string;
  error?: string;
  warning?: string;
}

/** Relative luminance of a #rrggbb / #rgb color (0 = black … 1 = white). */
function luminance(hex?: string): number | null {
  if (!hex) return null;
  const m = hex.replace('#', '').trim();
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (v.length < 6) return null;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Whether a template reads as a light theme (drives the forced color-scheme). */
export function paletteColorScheme(p: GridPalette): 'light' | 'dark' {
  const lum = luminance(p.bg_page ?? p.bg_card);
  return lum != null && lum > 0.5 ? 'light' : 'dark';
}

/** A translucent tint of a color (for Mantine "light" variant backgrounds). */
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
/** A darkened shade of a color (for hover states). */
const shade = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, #000)`;

/**
 * Build the CSS-variable map that re-skins the grid to a template palette.
 * Covers two layers:
 *   • Chrome  — the grid's own `--dg-*` vars (frame, header, rows, accent bar).
 *   • Widgets — Mantine vars so the search box, Select editors, checkboxes,
 *               menus, buttons and badges follow the same palette.
 * Returned as a plain record usable both as an inline `style` object (in-scope
 * DOM) and, via `paletteCss`, as a scoped rule for portalled dropdowns.
 */
export function gridPaletteVars(p: GridPalette): Record<string, string> {
  const vars: Record<string, string> = {};
  const set = (k: string, v?: string) => {
    if (v) vars[k] = v;
  };

  // ── Chrome (DataGrid.module.css) ──
  set('--dg-surface', p.bg_card);
  set('--dg-surface-alt', p.bg_surface);
  set('--dg-header-bg', p.bg_surface);
  set('--dg-hover', p.bg_hover);
  set('--dg-border', p.border);
  set('--dg-accent', p.primary);

  // ── Text ──
  set('--mantine-color-text', p.text_primary);
  set('--mantine-color-bright', p.text_primary);
  set('--mantine-color-dimmed', p.text_secondary);
  set('--mantine-color-placeholder', p.text_secondary);

  // ── Surfaces + the "default" variant (buttons, inputs, action icons) ──
  set('--mantine-color-body', p.bg_card);
  set('--mantine-color-default', p.bg_surface);
  set('--mantine-color-default-hover', p.bg_hover);
  set('--mantine-color-default-border', p.border);
  set('--mantine-color-default-color', p.text_primary);

  // ── Primary / brand (filled + light variants) ──
  if (p.primary) {
    const primary = p.primary;
    for (const name of ['--mantine-primary-color', '--mantine-color-brand']) {
      set(`${name}-filled`, primary);
      set(`${name}-filled-hover`, shade(primary, 85));
      set(`${name}-light`, tint(primary, 15));
      set(`${name}-light-hover`, tint(primary, 25));
      set(`${name}-light-color`, primary);
    }
    set('--mantine-color-brand-6', primary);
    set('--mantine-color-anchor', primary);
  }

  // ── States ──
  set('--mantine-color-error', p.error);

  return vars;
}

/** Serialize the palette vars as a scoped CSS rule (for portalled dropdowns,
 *  which render outside the grid's DOM subtree and so miss inline vars). */
export function paletteCss(selector: string, p: GridPalette): string {
  const scheme = paletteColorScheme(p);
  const body = Object.entries(gridPaletteVars(p))
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  return `${selector}{color-scheme:${scheme};${body}}`;
}

/** Context that lets the grid's portalled overlays (Menu/Popover/Select
 *  dropdowns) opt into the same scoped theme class as the grid root. Empty when
 *  no palette is active, so default (unthemed) behaviour is unchanged. */
export interface GridThemeCtx {
  /** Class carrying the palette vars — applied to each portalled dropdown. */
  portalClassName?: string;
}
export const GridThemeContext = createContext<GridThemeCtx>({});
export const useGridTheme = () => useContext(GridThemeContext);
