/**
 * Tiny RFC 4180-style CSV parser.
 * Handles: quoted fields, escaped quotes (""), commas/newlines inside quotes,
 * UTF-8 BOM, CRLF / LF / CR line endings, trailing blank lines.
 * @param {string} text
 * @returns {string[][]} rows
 */
export function parseCSV(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  // drop fully empty lines
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/**
 * Parse CSV into objects keyed by (trimmed, lower-cased) header names.
 * @param {string} text
 * @returns {Record<string,string>[]}
 */
export function parseCSVObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r, idx) => {
    const o = { __line: idx + 2 };
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}
