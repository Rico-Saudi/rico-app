/// A cell a spreadsheet would run as a formula: `=HYPERLINK(...)`,
/// `+cmd|...`, `@SUM(...)`. Vendor-editable fields (phone, district, names)
/// reach the owner's export, so one vendor could plant a formula that runs on
/// the owner's machine. A leading quote makes Excel/Sheets show it as text.
/// Plain numbers and phone numbers ("+962 7…", "-5") are left alone — they
/// are the common case and can't carry a formula.
function neutralizeFormula(str: string): string {
  if (!/^[=+\-@\t\r]/.test(str)) return str;
  if (/^[+-]?[\d\s().-]+$/.test(str)) return str;
  return `'${str}`;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? neutralizeFormula(value) : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','));
  return [headerLine, ...lines].join('\r\n');
}
