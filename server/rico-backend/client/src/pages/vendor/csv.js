import { IMPORT_COLUMNS } from './verticals';

// Excel saves "CSV" with whatever separator the machine's locale uses, and
// Arabic-locale machines often use a semicolon. The header line decides.
function detectDelimiter(headerLine) {
  const counts = [',', ';', '\t'].map((d) => [d, headerLine.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

// RFC 4180-ish: quoted cells may hold the delimiter, newlines and "" escapes.
export function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const delimiter = detectDelimiter(firstLine);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Which column holds which field. Unknown columns are reported, not guessed.
export function mapHeaders(headerRow) {
  const mapping = {};
  const unknown = [];
  headerRow.forEach((raw, index) => {
    const header = raw.trim().toLowerCase();
    const field = Object.keys(IMPORT_COLUMNS).find((f) => IMPORT_COLUMNS[f].some((alias) => alias.toLowerCase() === header));
    if (field && mapping[field] === undefined) mapping[field] = index;
    else if (header) unknown.push(raw.trim());
  });
  return { mapping, unknown };
}

export function rowsToProducts(rows, mapping) {
  return rows.map((cells) => {
    const product = {};
    for (const [field, index] of Object.entries(mapping)) {
      const value = (cells[index] ?? '').trim();
      if (value !== '') product[field] = value;
    }
    return product;
  });
}

function escapeCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The same Arabic headers the importer reads, so an export opened in Excel,
// edited and uploaded again updates the same products.
export const EXPORT_HEADERS = ['الاسم', 'السعر', 'الفئة', 'الوحدة', 'الماركة', 'الباركود', 'الكلمات المفتاحية', 'متوفر'];

export function productsToCsv(products) {
  const lines = [EXPORT_HEADERS.join(',')];
  for (const p of products) {
    lines.push(
      [p.name, p.price, p.category, p.unit, p.brand, p.sku, (p.keywords || []).join('، '), p.inStock === false ? 'لا' : 'نعم']
        .map(escapeCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}

// BOM first, or Excel reads the Arabic as mojibake.
export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
