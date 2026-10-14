/* Render helpers. All CSV-derived text goes through textContent — never innerHTML. */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReduced = () => reduceMotion.matches;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(id) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVG_NS, 'use');
  u.setAttribute('href', `#${id}`);
  s.append(u);
  return s;
}

/** Web Animations helper — resolves when finished; no-op with reduced motion. */
export function animate(el, keyframes, opts) {
  if (prefersReduced() || !el.animate) return Promise.resolve();
  const a = el.animate(keyframes, { easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both', ...opts });
  return a.finished.then(() => { try { a.commitStyles?.(); a.cancel(); } catch {} }).catch(() => {});
}

/* ---------- Search normalisation (Sinhala-safe: ignores ZWJ/ZWNJ) ---------- */
const INVISIBLE = /[\u200B-\u200D\uFEFF]/;
function normWithMap(str) {
  let out = '';
  const map = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (INVISIBLE.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (out.endsWith(' ') || out === '') continue;
      out += ' '; map.push(i); continue;
    }
    const low = ch.toLowerCase();
    for (let k = 0; k < low.length; k++) { out += low[k]; map.push(i); }
  }
  return { out, map };
}
export function tokenize(q) { return normWithMap(q || '').out.trim().split(' ').filter(Boolean); }

function findRanges(str, tokens) {
  if (!tokens.length || !str) return [];
  const { out, map } = normWithMap(str);
  const ranges = [];
  for (const t of tokens) {
    let from = 0, idx;
    while ((idx = out.indexOf(t, from)) !== -1) {
      ranges.push([map[idx], map[idx + t.length - 1] + 1]);
      from = idx + t.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r.slice());
  }
  return merged;
}

export function matches(topic, tokens) {
  if (!tokens.length) return true;
  const hay = normWithMap(`${topic.si} ${topic.en} ${topic.id}`).out;
  return tokens.every((t) => hay.includes(t));
}

function highlight(el, text, tokens) {
  const ranges = findRanges(text, tokens);
  if (!ranges.length) { el.append(document.createTextNode(text)); return el; }
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) el.append(document.createTextNode(text.slice(pos, s)));
    el.append(h('mark', { text: text.slice(s, e) }));
    pos = e;
  }
  if (pos < text.length) el.append(document.createTextNode(text.slice(pos)));
  return el;
}

/* ---------- Dates ---------- */
const fmtLong = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const formatDate = (iso) => (iso ? fmtLong.format(new Date(iso + 'T00:00:00Z')) : '');

/* ---------- Row ---------- */
function pill(kind, url, topic) {
  const isTheory = kind === 'theory';
  const label = isTheory ? 'Notes' : 'Papers';
  const full = isTheory ? 'Theory notes' : 'Past papers';
  const name = topic.en || topic.si;
  if (!url) {
    return h('span', { class: 'pill', 'aria-label': `${full} for ${name}: not available yet`, role: 'img' }, icon(isTheory ? 'i-book' : 'i-paper'), label);
  }
  return h('a', {
    class: 'pill', href: url, target: '_blank', rel: 'noopener noreferrer',
    'aria-label': `${full} for ${name}`,
  }, icon(isTheory ? 'i-book' : 'i-paper'), label);
}

function row(t, tokens) {
  const only = t.theory && !t.paper ? t.theory : !t.theory && t.paper ? t.paper : '';
  const si = h('span', { lang: 'si' });
  highlight(si, t.si || t.en, tokens);
  const title = h('div', { class: 't-si' }, si);
  if (t.isNew) title.append(h('span', { class: 'new-tag', text: 'New' }));
  const titles = h('div', { class: 'titles' }, title);
  if (t.si && t.en) {
    const en = h('div', { class: 't-en' });
    highlight(en, t.en, tokens);
    titles.append(en);
  }
  const li = h('li', { class: `row${only ? ' single' : ''}`, 'data-id': t.id },
    h('span', { class: 'num', text: String(t.order).padStart(2, '0') }),
    titles,
    h('div', { class: 'links' }, pill('theory', t.theory, t), pill('paper', t.paper, t)),
  );
  if (only) li.dataset.href = only;
  return li;
}

export function renderList(list, items, tokens, { animate: anim = true } = {}) {
  list.setAttribute('aria-busy', 'false');
  list.replaceChildren(...items.map((t) => row(t, tokens)));
  if (!anim || prefersReduced()) return;
  const rows = [...list.children];
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const i = Math.min(rows.indexOf(en.target), 10);
      animate(en.target, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: i * 28 });
    });
  }, { rootMargin: '0px 0px -5% 0px' });
  rows.forEach((r) => { r.style.opacity = '0'; io.observe(r); });
}

export function renderSkeleton(list, n = 6) {
  list.setAttribute('aria-busy', 'true');
  list.replaceChildren(...Array.from({ length: n }, () => {
    const li = h('li', { class: 'row skeleton', 'aria-hidden': 'true' },
      h('span', { class: 'sk sk-num' }),
      h('div', { class: 'titles' }, h('div', { class: 'sk sk-line w70' }), h('div', { class: 'sk sk-line w45' })),
      h('span', { class: 'sk sk-pill' }));
    return li;
  }));
}

export function textButton(label, onClick) {
  const b = h('button', { class: 'text-btn', type: 'button', text: label });
  b.addEventListener('click', onClick);
  return b;
}

export function renderState(list, { kind, title, text, action, onAction, extra }) {
  list.setAttribute('aria-busy', 'false');
  const box = h('li', { class: 'state' },
    icon(kind === 'error' ? 'i-wifi-off' : 'i-search'),
    h('h2', { text: title }),
    h('p', { text }),
  );
  if (action) box.append(textButton(action, onAction));
  if (extra) box.append(extra);
  list.replaceChildren(box);
}

export function toast(msg, iconId = 'i-check') {
  const wrap = document.getElementById('toasts');
  const el = h('div', { class: 'toast' }, icon(iconId), msg);
  wrap.append(el);
  animate(el, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 240 });
  setTimeout(async () => {
    await animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    el.remove();
  }, 2200);
}
