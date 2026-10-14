import { fetchTopics, readCache } from './data.js';
import { initTheme } from './theme.js';
import {
  renderList, renderSkeleton, renderState, textButton, toast, attachRipple,
  animate, tokenize, matches, formatDate, prefersReduced,
} from './ui.js';

/* ---------- Persistent prefs ---------- */
const store = {
  get(k, d) { try { return localStorage.getItem(`cmn:${k}`) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`cmn:${k}`, v); } catch {} },
};

const FILTERS = {
  all: () => true,
  theory: (t) => !!t.theory,
  paper: (t) => !!t.paper,
  both: (t) => !!t.theory && !!t.paper,
  new: (t) => t.isNew,
  soon: (t) => !t.theory || !t.paper,
};
const CATS = ['pure', 'applied'];
const LABEL = { pure: 'PURE', applied: 'APPLIED' };

const state = {
  topics: [],
  sig: '',
  tab: store.get('tab', 'pure') === 'applied' ? 'applied' : 'pure',
  view: store.get('view', 'list') === 'grid' ? 'grid' : 'list',
  filter: 'all',
  query: '',
  loaded: false,
};

/* ---------- DOM ---------- */
const $ = (s) => document.querySelector(s);
const els = {
  header: $('#header'),
  tabs: $('#tabs'),
  tabBtns: [...document.querySelectorAll('.tab')],
  panel: $('#panel'),
  list: $('#list'),
  search: $('#search'),
  searchWrap: $('#search-wrap'),
  searchClear: $('#search-clear'),
  filterBtn: $('#filter-btn'),
  count: $('#result-count'),
  viewBtns: [...document.querySelectorAll('.view-btn')],
  backdrop: $('#backdrop'),
  filterSheet: $('#filter-sheet'),
  actionSheet: $('#action-sheet'),
  chips: [...document.querySelectorAll('.chip')],
  fab: $('#fab'),
  offline: $('#offline-banner'),
  install: $('#install-banner'),
  lastUpdated: $('#last-updated'),
};

const haptic = () => { try { navigator.vibrate?.(10); } catch {} };

/* ---------- Derived data ---------- */
function visible(cat = state.tab) {
  const tokens = tokenize(state.query);
  const f = FILTERS[state.filter] || FILTERS.all;
  return state.topics.filter((t) => t.category === cat && f(t) && matches(t, tokens));
}

/* ---------- Render ---------- */
function render({ animate: anim = true } = {}) {
  if (!state.loaded) return;
  const tokens = tokenize(state.query);
  const items = visible();
  const counts = Object.fromEntries(CATS.map((c) => [c, visible(c).length]));
  CATS.forEach((c) => { $(`#count-${c}`).textContent = counts[c]; });

  const filtered = state.filter !== 'all' || tokens.length > 0;
  els.count.textContent = `${items.length} topic${items.length === 1 ? '' : 's'}${filtered ? ' found' : ''} in ${LABEL[state.tab]}`;

  if (!items.length) {
    const other = CATS.find((c) => c !== state.tab);
    const extra = counts[other] ? textButton(`See ${counts[other]} in ${LABEL[other]}`, () => setTab(other)) : null;
    renderState(els.list, {
      kind: 'empty',
      title: 'No topics found',
      text: tokens.length ? `Nothing matches “${state.query.trim()}” here. Try another word in Sinhala or English.` : 'No topics match this filter yet.',
      action: 'Clear filters',
      onAction: clearAll,
      extra,
    });
    return;
  }
  renderList(els.list, items, tokens, { animate: anim });
}

function renderFooter() {
  const newest = state.topics.reduce((m, t) => (t.updated > m ? t.updated : m), '');
  els.lastUpdated.textContent = newest ? `Last updated ${formatDate(newest, true)}` : '';
}

/* ---------- Tabs ---------- */
async function setTab(cat, { fromSwipe = false, silent = false } = {}) {
  if (!CATS.includes(cat) || cat === state.tab) { if (!silent) render({ animate: false }); return; }
  const dir = CATS.indexOf(cat) > CATS.indexOf(state.tab) ? 1 : -1;
  state.tab = cat;
  store.set('tab', cat);
  syncTabs();
  syncHash();
  if (!silent) haptic();
  if (!state.loaded) return;

  const list = els.list;
  if (!prefersReduced()) {
    await animate(list, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-24 * dir}px)`, opacity: 0 }], { duration: fromSwipe ? 140 : 160 });
  }
  render({ animate: false });
  animate(list, [{ transform: `translateX(${32 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 });
  if (window.scrollY > els.panel.offsetTop) {
    window.scrollTo({ top: Math.max(0, els.tabs.offsetTop - 80), behavior: prefersReduced() ? 'auto' : 'smooth' });
  }
}

function syncTabs() {
  els.tabs.dataset.active = state.tab;
  els.tabBtns.forEach((b) => {
    const on = b.dataset.cat === state.tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  els.panel.setAttribute('aria-labelledby', `tab-${state.tab}`);
}

els.tabBtns.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.cat)));
els.tabs.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const next = state.tab === 'pure' ? 'applied' : 'pure';
  setTab(next);
  $(`#tab-${next}`).focus();
});

/* Swipe between tabs */
(function swipe() {
  let x0 = 0, y0 = 0, t0 = 0, tracking = false;
  els.panel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); tracking = true;
  }, { passive: true });
  els.panel.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    const fast = Date.now() - t0 < 600;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && fast) {
      if (dx < 0 && state.tab === 'pure') setTab('applied', { fromSwipe: true });
      else if (dx > 0 && state.tab === 'applied') setTab('pure', { fromSwipe: true });
    }
  }, { passive: true });
  els.panel.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
})();

/* ---------- Search ---------- */
let searchTimer;
els.search.addEventListener('input', () => {
  els.searchWrap.classList.toggle('has-value', els.search.value.length > 0);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.search.value;
    syncHash();
    softRender();
  }, 140);
});
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && els.search.value) { e.preventDefault(); setQuery(''); }
  if (e.key === 'Enter') els.search.blur();
});
els.searchClear.addEventListener('click', () => { setQuery(''); els.search.focus(); });

function setQuery(q) {
  els.search.value = q;
  els.searchWrap.classList.toggle('has-value', q.length > 0);
  state.query = q;
  syncHash();
  softRender();
}

/** Short cross-fade re-render (search / filter). */
let softPending = false;
async function softRender() {
  if (!state.loaded) return;
  if (softPending) return;
  softPending = true;
  await animate(els.list, [{ opacity: 1 }, { opacity: 0.25 }], { duration: 90 });
  softPending = false;
  render({ animate: false });
  animate(els.list, [{ opacity: 0.25, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220 });
}

/* ---------- Filters ---------- */
function setFilter(f) {
  if (!FILTERS[f]) f = 'all';
  state.filter = f;
  els.chips.forEach((c) => c.setAttribute('aria-checked', String(c.dataset.filter === f)));
  els.filterBtn.classList.toggle('has-filter', f !== 'all');
  els.filterBtn.setAttribute('aria-label', f === 'all' ? 'Filter topics' : `Filter topics (active: ${els.chips.find((c) => c.dataset.filter === f).textContent.trim()})`);
  softRender();
}
els.chips.forEach((c) => c.addEventListener('click', () => { haptic(); setFilter(c.dataset.filter); }));
$('#filter-reset').addEventListener('click', () => setFilter('all'));
els.filterBtn.addEventListener('click', () => openSheet(els.filterSheet));

function clearAll() {
  setFilter('all');
  setQuery('');
}

/* ---------- View toggle ---------- */
function setView(v) {
  state.view = v === 'grid' ? 'grid' : 'list';
  store.set('view', state.view);
  els.list.dataset.view = state.view;
  els.viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
}
els.viewBtns.forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.view === state.view) return;
  setView(b.dataset.view);
  animate(els.list, [{ opacity: 0.4, transform: 'scale(0.99)' }, { opacity: 1, transform: 'none' }], { duration: 240 });
}));

/* ---------- Bottom sheets ---------- */
let openSheetEl = null;
let lastFocus = null;

function openSheet(sheet) {
  if (openSheetEl) closeSheet(true);
  lastFocus = document.activeElement;
  openSheetEl = sheet;
  sheet.style.removeProperty('--drag');
  sheet.setAttribute('aria-hidden', 'false');
  sheet.classList.add('open');
  els.backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  const first = sheet.querySelector('[aria-checked="true"], .action-item:not(:disabled), button:not([data-close])');
  setTimeout(() => (first || sheet).focus({ preventScroll: true }), 60);
}

function closeSheet(instant) {
  const sheet = openSheetEl;
  if (!sheet) return;
  openSheetEl = null;
  sheet.classList.remove('open', 'dragging');
  sheet.style.removeProperty('--drag');
  sheet.setAttribute('aria-hidden', 'true');
  els.backdrop.classList.remove('open');
  document.body.style.overflow = '';
  if (!instant && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
}

els.backdrop.addEventListener('click', () => closeSheet());
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet()));
document.addEventListener('keydown', (e) => {
  if (!openSheetEl) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Tab') {
    const f = [...openSheetEl.querySelectorAll('button:not(:disabled)')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* Drag to dismiss */
[els.filterSheet, els.actionSheet].forEach((sheet) => {
  let y0 = 0, dy = 0, t0 = 0, active = false, dragging = false, pid = null;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    active = true; dragging = false; y0 = e.clientY; dy = 0; t0 = Date.now(); pid = e.pointerId;
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== pid) return;
    dy = e.clientY - y0;
    if (!dragging && dy > 8) {
      dragging = true;
      sheet.classList.add('dragging');
      try { sheet.setPointerCapture(pid); } catch {}
    }
    if (dragging) sheet.style.setProperty('--drag', `${Math.max(0, dy)}px`);
  });
  const end = () => {
    if (!active) return;
    active = false;
    if (!dragging) return;
    sheet.classList.remove('dragging');
    const v = dy / Math.max(1, Date.now() - t0);
    if (dy > sheet.offsetHeight * 0.3 || v > 0.6) closeSheet();
    else sheet.style.setProperty('--drag', '0px');
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
});

/* ---------- Card menu (⋮ / long-press / right-click) ---------- */
let menuTopic = null;
const appUrl = () => location.href.split('#')[0];

function openMenu(id) {
  const t = state.topics.find((x) => x.id === id);
  if (!t) return;
  menuTopic = t;
  $('#action-title').textContent = t.si || t.en;
  $('#action-title').lang = t.si ? 'si' : 'en';
  $('#action-sub').textContent = t.si ? t.en : '';
  const theoryBtn = els.actionSheet.querySelector('[data-act="copy-theory"]');
  const paperBtn = els.actionSheet.querySelector('[data-act="copy-paper"]');
  theoryBtn.disabled = !t.theory;
  paperBtn.disabled = !t.paper;
  theoryBtn.querySelector('small').textContent = t.theory ? '' : 'Coming soon';
  paperBtn.querySelector('small').textContent = t.paper ? '' : 'Coming soon';
  openSheet(els.actionSheet);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;left:-999px';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

els.actionSheet.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled || !menuTopic) return;
  const t = menuTopic;
  const act = btn.dataset.act;
  closeSheet();
  if (act === 'copy-theory' || act === 'copy-paper') {
    const ok = await copy(act === 'copy-theory' ? t.theory : t.paper);
    toast(ok ? 'Link copied' : 'Could not copy link', ok ? 'i-check' : 'i-x');
    return;
  }
  const url = `${appUrl()}#topic=${encodeURIComponent(t.id)}`;
  const lines = [`${t.si}${t.si && t.en ? ' – ' : ''}${t.en}`, 'CM Notez | Combined Mathematics'];
  if (t.theory) lines.push(`📘 Theory Note: ${t.theory}`);
  if (t.paper) lines.push(`📝 Past Papers: ${t.paper}`);
  const text = lines.join('\n');
  if (navigator.share) {
    try { await navigator.share({ title: `CM Notez – ${t.en || t.si}`, text, url }); return; }
    catch (err) { if (err?.name === 'AbortError') return; }
  }
  const ok = await copy(`${text}\n${url}`);
  toast(ok ? 'Link copied' : 'Could not copy link', ok ? 'i-check' : 'i-x');
});

els.list.addEventListener('click', (e) => {
  const m = e.target.closest('[data-menu]');
  if (m) { haptic(); openMenu(m.dataset.menu); }
});
els.list.addEventListener('contextmenu', (e) => {
  const card = e.target.closest('.card[data-id]');
  if (!card) return;
  e.preventDefault();
  openMenu(card.dataset.id);
});

/* Long-press (touch) */
(function longPress() {
  let timer = null, x = 0, y = 0, fired = false;
  els.list.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const card = e.target.closest('.card[data-id]');
    if (!card || e.target.closest('[data-menu]')) return;
    fired = false; x = e.clientX; y = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => { fired = true; haptic(); openMenu(card.dataset.id); }, 520);
  }, { passive: true });
  const cancel = () => clearTimeout(timer);
  els.list.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - x, e.clientY - y) > 10) cancel(); }, { passive: true });
  els.list.addEventListener('pointerup', cancel, { passive: true });
  els.list.addEventListener('pointercancel', cancel, { passive: true });
  // swallow the click that follows a long-press so a link doesn't open
  els.list.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
})();

/* ---------- Hash deep links: #pure, #applied, #search=..., #topic=id ---------- */
let writingHash = false;
function parseHash() {
  const out = {};
  const h = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
  if (!h) return out;
  for (const part of h.split('&')) {
    const [k, ...rest] = part.split('=');
    const v = rest.join('=');
    if (CATS.includes(k.toLowerCase())) out.tab = k.toLowerCase();
    else if (k === 'search' || k === 'q') out.search = v;
    else if (k === 'topic') out.topic = v;
    else if (k === 'filter' && FILTERS[v]) out.filter = v;
  }
  return out;
}
function syncHash() {
  const parts = [state.tab];
  if (state.query.trim()) parts.push(`search=${encodeURIComponent(state.query.trim())}`);
  const next = `#${parts.join('&')}`;
  if (location.hash !== next) {
    writingHash = true;
    history.replaceState(null, '', next);
    writingHash = false;
  }
}
function applyHash({ initial = false } = {}) {
  const h = parseHash();
  if (h.topic && state.loaded) {
    const t = state.topics.find((x) => x.id === h.topic);
    if (t) {
      state.tab = t.category;
      store.set('tab', t.category);
      syncTabs();
      render({ animate: false });
      requestAnimationFrame(() => {
        const card = els.list.querySelector(`[data-id="${CSS.escape(t.id)}"]`);
        if (card) {
          card.scrollIntoView({ block: 'center', behavior: prefersReduced() ? 'auto' : 'smooth' });
          animate(card, [{ boxShadow: '0 0 0 3px #2AABEE' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1600, delay: 300 });
        }
      });
      return;
    }
  }
  if (h.tab) { state.tab = h.tab; store.set('tab', h.tab); }
  if (h.filter) setFilter(h.filter);
  if (h.search != null) {
    els.search.value = h.search;
    els.searchWrap.classList.toggle('has-value', !!h.search);
    state.query = h.search;
  }
  syncTabs();
  if (!initial) render({ animate: false });
}
window.addEventListener('hashchange', () => { if (!writingHash) applyHash(); });

/* ---------- Scroll: header shrink + FAB ---------- */
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY;
    els.header.classList.toggle('is-scrolled', y > 10);
    const show = y > 480;
    els.fab.classList.toggle('show', show);
    els.fab.tabIndex = show ? 0 : -1;
    ticking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
els.fab.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
  els.search.focus({ preventScroll: true });
  els.search.blur();
});

/* ---------- Online / offline ---------- */
function syncOnline() { els.offline.hidden = navigator.onLine; }
window.addEventListener('online', () => { syncOnline(); load({ background: true }); });
window.addEventListener('offline', syncOnline);

/* ---------- Install prompt ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (store.get('install', '') === 'done') return;
  setTimeout(() => { if (deferredPrompt) els.install.hidden = false; }, 2500);
});
$('#install-btn').addEventListener('click', async () => {
  els.install.hidden = true;
  store.set('install', 'done');
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch {}
  deferredPrompt = null;
});
$('#install-close').addEventListener('click', () => { els.install.hidden = true; store.set('install', 'done'); });
window.addEventListener('appinstalled', () => { els.install.hidden = true; store.set('install', 'done'); toast('CM Notez installed'); });

/* ---------- Data loading (stale-while-revalidate) ---------- */
function setData(topics, sig) {
  const first = !state.loaded;
  state.topics = topics;
  state.sig = sig || '';
  state.loaded = true;
  renderFooter();
  if (first) applyHash({ initial: true });
  render({ animate: first });
  if (first && parseHash().topic) applyHash();
}

async function load({ background = false } = {}) {
  try {
    const { topics, sig } = await fetchTopics();
    if (sig !== state.sig) setData(topics, sig);
  } catch (err) {
    console.warn('[CM Notez] Could not load topics.csv:', err);
    if (state.loaded) {
      if (!background && navigator.onLine) toast('Showing saved notes', 'i-wifi-off');
      return;
    }
    els.count.textContent = 'Could not load topics';
    renderState(els.list, {
      kind: 'error',
      title: 'Couldn’t load the notes',
      text: navigator.onLine ? 'Something went wrong while loading the catalog. Please try again.' : 'You’re offline and no saved copy is available yet. Connect to the internet and retry.',
      action: 'Retry',
      onAction: () => { renderSkeleton(els.list); load(); },
    });
  }
}

/* ---------- Boot ---------- */
initTheme($('#theme-toggle'), () => haptic());
attachRipple(document.body);
setView(state.view);
applyHash({ initial: true });
syncOnline();

const cached = readCache();
if (cached?.topics?.length) setData(cached.topics, cached.sig);
else renderSkeleton(els.list, 6);
load();

// Re-check for CSV edits when the app is brought back to the foreground
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.loaded) load({ background: true });
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[CM Notez] SW registration failed', e));
  });
}
