/**
 * Table export helpers shared by the DataGrid toolbar. Everything here is
 * dependency-free (plain browser APIs): CSV/Excel/JSON downloads, a print
 * view, and a clipboard copy. All formats operate on the same
 * `headers` + `rows` shape the grid extracts from its current
 * (filtered, visible) view.
 */

import { toCsv, downloadCsv } from './csv';

export { toCsv, downloadCsv };

/** Stringify a cell value for text-based formats (CSV/TSV/HTML). */
const stringify = (value: unknown): string => {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
};

/** Escape a value for embedding in HTML (Excel/print tables). */
const escapeHtml = (value: unknown): string =>
  stringify(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const withExt = (filename: string, ext: string): string =>
  filename.toLowerCase().endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;

/** Download a blob client-side via a temporary object URL. */
const downloadBlob = (filename: string, blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ── TSV / clipboard ─────────────────────────────────────────────────────────

/** Tab-separated text — the format spreadsheets accept from the clipboard. */
export const toTsv = (headers: string[], rows: unknown[][]): string => {
  const clean = (v: unknown) => stringify(v).replace(/[\t\r\n]+/g, ' ');
  return [headers, ...rows].map((cells) => cells.map(clean).join('\t')).join('\n');
};

/**
 * Copy the table to the clipboard as TSV (pastes cleanly into Excel / Google
 * Sheets). Resolves `true` on success, `false` if the clipboard is unavailable
 * or the write is rejected.
 */
export const copyToClipboard = async (
  headers: string[],
  rows: unknown[][],
): Promise<boolean> => {
  const text = toTsv(headers, rows);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  // Legacy fallback for non-secure contexts without the async clipboard API.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

// ── JSON ──────────────────────────────────────────────────────────────────

/** Serialize rows as an array of `{ header: value }` objects. */
export const toJson = (headers: string[], rows: unknown[][]): string => {
  const objects = rows.map((cells) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? null;
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
};

export const downloadJson = (
  filename: string,
  headers: string[],
  rows: unknown[][],
): void => {
  const blob = new Blob([toJson(headers, rows)], {
    type: 'application/json;charset=utf-8;',
  });
  downloadBlob(withExt(filename, 'json'), blob);
};

// ── HTML table (Excel + print) ──────────────────────────────────────────────

const tableMarkup = (headers: string[], rows: unknown[][]): string => {
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  const body = rows
    .map((cells) => `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
};

/**
 * Download an Excel-openable file. This is an HTML table saved with the
 * `application/vnd.ms-excel` MIME type and an `.xls` extension — the standard
 * dependency-free approach. Excel opens it natively (modern versions may show a
 * one-time format-vs-extension prompt, which a true `.xlsx` writer would avoid
 * but that needs a zip library).
 */
export const downloadExcel = (
  filename: string,
  headers: string[],
  rows: unknown[][],
  title?: string,
): void => {
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
    `xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8" />` +
    `<style>table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px;` +
    `text-align:left;mso-number-format:"\\@"}th{background:#f0f0f0;font-weight:bold}</style>` +
    `</head><body>${title ? `<h3>${escapeHtml(title)}</h3>` : ''}` +
    `${tableMarkup(headers, rows)}</body></html>`;
  const blob = new Blob(['﻿' + html], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  downloadBlob(withExt(filename, 'xls'), blob);
};

/**
 * Open a print window with a styled table and trigger the browser print dialog.
 * The window closes itself after printing. Colors are theme-neutral (print is
 * always on white paper).
 */
export const printTable = (
  headers: string[],
  rows: unknown[][],
  title?: string,
): void => {
  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) return;
  const doc = win.document;
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8" />` +
      `<title>${escapeHtml(title ?? 'Export')}</title>` +
      `<style>` +
      `*{box-sizing:border-box}` +
      `body{font-family:Inter,system-ui,Arial,sans-serif;color:#111;margin:24px}` +
      `h2{font-size:18px;margin:0 0 16px}` +
      `table{border-collapse:collapse;width:100%;font-size:12px}` +
      `th,td{border:1px solid #d0d0d0;padding:6px 10px;text-align:left}` +
      `th{background:#f4f4f4;font-weight:600}` +
      `tbody tr:nth-child(even){background:#fafafa}` +
      `@media print{body{margin:0}}` +
      `</style></head><body>` +
      `${title ? `<h2>${escapeHtml(title)}</h2>` : ''}` +
      `${tableMarkup(headers, rows)}</body></html>`,
  );
  doc.close();
  win.focus();
  // Give the new document a tick to lay out before printing.
  win.setTimeout(() => {
    win.print();
    win.close();
  }, 250);
};
