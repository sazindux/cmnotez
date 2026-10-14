import { parseCSVObjects } from './csv.js';

const CSV_URL = './data/topics.csv';
const CACHE_KEY = 'cmn:data:v1';

/** Only allow http(s) URLs — blocks javascript:, data:, etc. */
export function safeUrl(value) {
  if (!value) return '';
  try {
    const u = new URL(value.trim(), location.href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

const isTrue = (v) => /^(true|yes|1|y)$/i.test((v || '').trim());
const validDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(Date.parse(v)) ? v : '');

/** Normalize raw CSV rows → topic objects, skipping malformed rows. */
export function normalize(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const id = r.id;
    const category = (r.category || '').toLowerCase();
    const title_si = r.title_si;
    const title_en = r.title_en;
    if (!id || (!title_si && !title_en) || (category !== 'pure' && category !== 'applied')) {
      console.warn(`[CM Notez] Skipping malformed CSV row (line ${r.__line}):`, r);
      continue;
    }
    if (seen.has(id)) {
      console.warn(`[CM Notez] Duplicate id "${id}" on line ${r.__line} — skipped.`);
      continue;
    }
    seen.add(id);
    const rawTheory = r.theory_url;
    const rawPaper = r.pastpaper_url;
    const theory = safeUrl(rawTheory);
    const paper = safeUrl(rawPaper);
    if (rawTheory && !theory) console.warn(`[CM Notez] Ignored unsafe theory_url for "${id}".`);
    if (rawPaper && !paper) console.warn(`[CM Notez] Ignored unsafe pastpaper_url for "${id}".`);
    const order = parseFloat(r.order);
    out.push({
      id,
      category,
      order: Number.isFinite(order) ? order : 9999,
      si: title_si || '',
      en: title_en || '',
      theory,
      paper,
      isNew: isTrue(r.is_new),
      updated: validDate(r.updated),
    });
  }
  out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return out;
}

export function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.topics) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(topics, text) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ topics, sig: text.length + ':' + hash(text), at: Date.now() }));
  } catch { /* quota / private mode */ }
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Fetch the CSV from the network (cache-busted).
 * @returns {Promise<{topics: object[], sig: string}>}
 */
export async function fetchTopics() {
  const res = await fetch(`${CSV_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const topics = normalize(parseCSVObjects(text));
  if (!topics.length) throw new Error('No valid topics in CSV');
  writeCache(topics, text);
  return { topics, sig: text.length + ':' + hash(text) };
}
