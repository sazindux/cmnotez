/* Render helpers. All CSV-derived text goes through textContent — never innerHTML. */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReduced = () => reduceMotion.matches;

/** Element factory */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(id, cls) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  const u = document.createElementNS(SVG_NS, 'use');
  u.setAttribute('href', `#${id}`);
  s.append(u);
  return s;
}

/* ---------- Search normalisation ---------- */
const INVISIBLE = /[\u200B-\u200D\uFEFF]/; // ZWJ/ZWNJ/ZWSP — Sinhala conjuncts use ZWJ

/** Normalise and keep an index map back to the original string (for highlighting). */
function normWithMap(str) {
  let out = '';
  const map = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (INVISIBLE.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (out.endsWith(' ') || out === '') continue;
      out += ' ';
      map.push(i);
      continue;
    }
    const low = ch.toLowerCase();
    for (let k = 0; k < low.length; k++) { out += low[k]; map.push(i); }
  }
  return { out, map };
}

export function tokenize(q) {
  return normWithMap(q || '').out.trim().split(' ').filter(Boolean);
}

/** Return [start,end) ranges in the original string matching any token. */
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

/** Fill an element with text, wrapping matched ranges in <mark>. Safe: text nodes only. */
function highlight(el, text, tokens) {
  const ranges = findRanges(text, tokens);
  if (!ranges.length) { el.textContent = text; return el; }
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
const fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtLong = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const formatDate = (iso, long) => (iso ? (long ? fmtLong : fmtShort).format(new Date(iso + 'T00:00:00Z')) : '');

/* ---------- Card ---------- */
function actionButton(kind, url, title) {
  const isTheory = kind === 'theory';
  const label = isTheory ? 'Theory Note' : 'Past Papers';
  if (!url) {
    return h('button', {
      class: 'btn btn-soon',
      type: 'button',
      disabled: true,
      title: `${label} coming soon`,
    }, icon('i-clock'), h('span', { class: 'btn-label' }, h('span', { text: 'Coming soon' }), h('small', { text: label })));
  }
  return h('a', {
    class: `btn ${isTheory ? 'btn-primary' : 'btn-tonal'}`,
    href: url,
    target: '_blank',
    rel: 'noopener noreferrer',
    'aria-label': `${label}: ${title} (opens in new tab)`,
    'data-kind': kind,
  }, icon(isTheory ? 'i-book' : 'i-paper'), h('span', { text: label }));
}

function statusRow(t) {
  const item = (ok, label) => h('span', { class: ok ? 'ok' : '' }, icon(ok ? 'i-ticks' : 'i-tick'), h('span', { text: ok ? label : `${label} soon` }));
  return h('div', { class: 'status', 'aria-label': `Available: ${[t.theory && 'theory note', t.paper && 'past papers'].filter(Boolean).join(' and ') || 'nothing yet'}` },
    item(!!t.theory, 'Theory'), item(!!t.paper, 'Past papers'));
}

export function renderCard(t, tokens) {
  const num = String(Math.round(t.order) < 9999 ? Math.round(t.order) : '').padStart(2, '0');
  const title = t.en || t.si;

  const tags = h('div', { class: 'tags' });
  if (t.isNew) tags.append(h('span', { class: 'pill-new', text: 'NEW' }));
  if (t.updated) {
    tags.append(h('time', { class: 'updated', datetime: t.updated, text: `Updated ${formatDate(t.updated)}` }));
  }

  const titles = h('div', { class: 'titles' });
  if (t.si) titles.append(highlight(h('h2', { class: 't-si', lang: 'si' }), t.si, tokens));
  if (t.en) titles.append(highlight(h(t.si ? 'p' : 'h2', { class: 't-en' }), t.en, tokens));

  const menu = h('button', {
    class: 'icon-btn menu-btn',
    type: 'button',
    'aria-label': `More options for ${title}`,
    'aria-haspopup': 'dialog',
    'data-menu': t.id,
  }, icon('i-dots'));

  return h('li', { class: 'card', 'data-id': t.id },
    h('div', { class: 'card-head' },
      h('span', { class: 'num', 'aria-hidden': 'true', text: num }),
      titles,
      menu,
    ),
    tags,
    h('div', { class: 'actions' }, actionButton('theory', t.theory, title), actionButton('paper', t.paper, title)),
    statusRow(t),
  );
}

/* ---------- Skeleton ---------- */
export function renderSkeleton(list, n = 6) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    frag.append(h('li', { class: 'card skeleton', 'aria-hidden': 'true' },
      h('div', { class: 'card-head' },
        h('span', { class: 'sk sk-num' }),
        h('div', { class: 'titles' }, h('div', { class: 'sk sk-line w70' }), h('div', { class: 'sk sk-line w45' })),
      ),
      h('div', { class: 'actions' }, h('span', { class: 'sk sk-btn' }), h('span', { class: 'sk sk-btn' })),
    ));
  }
  list.replaceChildren(frag);
  list.setAttribute('aria-busy', 'true');
}

/* ---------- Stagger reveal (IntersectionObserver) ---------- */
let io;
function observer() {
  if (io) return io;
  io = new IntersectionObserver((entries) => {
    let i = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      el.style.setProperty('--delay', `${Math.min(i++ * 35, 400)}ms`);
      el.classList.add('in');
      io.unobserve(el);
      el.addEventListener('transitionend', () => { el.classList.remove('reveal', 'in'); el.style.removeProperty('--delay'); }, { once: true });
    }
  }, { rootMargin: '0px 0px -24px 0px', threshold: 0.01 });
  return io;
}

/**
 * Render a list of topics.
 * @param {HTMLElement} list
 * @param {object[]} topics
 * @param {string[]} tokens
 * @param {{animate?: boolean}} opts
 */
export function renderList(list, topics, tokens, { animate = true } = {}) {
  const frag = document.createDocumentFragment();
  const cards = topics.map((t) => renderCard(t, tokens));
  const doAnimate = animate && !prefersReduced() && 'IntersectionObserver' in window;
  if (doAnimate) cards.forEach((c) => c.classList.add('reveal'));
  frag.append(...cards);
  io?.disconnect();
  list.replaceChildren(frag);
  list.setAttribute('aria-busy', 'false');
  if (doAnimate) {
    const obs = observer();
    // observe on the next frame so the hidden initial state is painted first (no forced reflow)
    requestAnimationFrame(() => cards.forEach((c) => obs.observe(c)));
  }
}

/* ---------- Empty / error states ---------- */
const EMPTY_ART = `<svg viewBox="0 0 120 96" fill="none" aria-hidden="true"><ellipse cx="60" cy="86" rx="38" ry="5" fill="currentColor" opacity=".08"/><rect x="26" y="14" width="56" height="68" rx="10" fill="var(--surface-2)" stroke="var(--border-strong)" stroke-width="2"/><path d="M38 32h32M38 44h24M38 56h28" stroke="var(--muted)" stroke-width="3" stroke-linecap="round" opacity=".5"/><circle cx="80" cy="58" r="16" fill="var(--surface)" stroke="#2AABEE" stroke-width="4"/><path d="m92 70 10 10" stroke="#2AABEE" stroke-width="5" stroke-linecap="round"/><path d="M75 58h10" stroke="#2AABEE" stroke-width="3" stroke-linecap="round"/></svg>`;
const ERROR_ART = `<svg viewBox="0 0 120 96" fill="none" aria-hidden="true"><ellipse cx="60" cy="86" rx="38" ry="5" fill="currentColor" opacity=".08"/><path d="M14 40a66 66 0 0 1 92 0M28 54a46 46 0 0 1 64 0M42 68a26 26 0 0 1 36 0" stroke="var(--muted)" stroke-width="5" stroke-linecap="round" opacity=".45"/><circle cx="60" cy="78" r="5" fill="#2AABEE"/><path d="M26 18l68 64" stroke="#2AABEE" stroke-width="5" stroke-linecap="round"/></svg>`;

export function renderState(list, { kind = 'empty', title, text, action, onAction, extra }) {
  const art = h('div', { 'aria-hidden': 'true' });
  art.innerHTML = kind === 'error' ? ERROR_ART : EMPTY_ART; // static markup only
  const li = h('li', { class: 'state', role: kind === 'error' ? 'alert' : null },
    art.firstChild,
    h('h2', { text: title }),
    h('p', { text }),
  );
  if (extra) li.append(extra);
  if (action) {
    const b = h('button', { class: 'btn btn-primary', type: 'button', text: action });
    b.addEventListener('click', onAction);
    li.append(b);
  }
  list.replaceChildren(li);
  list.setAttribute('aria-busy', 'false');
}

export function textButton(text, onClick, cls = 'btn btn-tonal') {
  const b = h('button', { class: cls, type: 'button', text });
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- Toast ---------- */
export function toast(msg, iconId = 'i-check') {
  const wrap = document.getElementById('toasts');
  wrap.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast' }, icon(iconId), h('span', { text: msg }));
  wrap.append(t);
  setTimeout(() => {
    t.classList.add('out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 400);
  }, 2000);
}

/* ---------- Ripple ---------- */
export function attachRipple(root) {
  root.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('.btn, .chip, .action-item, .filter-btn, .tab');
    if (!target || target.disabled || target.classList.contains('btn-soon') || prefersReduced()) return;
    const r = target.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    target.append(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  }, { passive: true });
}

/* ---------- Animate helper (WAAPI with graceful fallback) ---------- */
export function animate(el, keyframes, opts) {
  if (prefersReduced() || !el.animate) return Promise.resolve();
  const a = el.animate(keyframes, { easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'none', ...opts });
  return a.finished.catch(() => {});
}
