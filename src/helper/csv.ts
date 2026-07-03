/**
 * Minimal, dependency-free CSV export. Values are RFC-4180 quoted (quotes,
 * commas and newlines are escaped) and the file is downloaded client-side via a
 * temporary object URL. A UTF-8 BOM is prepended so Excel reads accents/unicode
 * correctly.
 */

const escapeCell = (value: unknown): string => {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

export const toCsv = (headers: string[], rows: unknown[][]): string => {
  const lines = [headers, ...rows].map((cells) => cells.map(escapeCell).join(','));
  return lines.join('\r\n');
};

export const downloadCsv = (filename: string, csv: string): void => {
  const name = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  // Prepend a UTF-8 BOM so Excel decodes unicode correctly.
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
