import { fetchTopics, readCache } from './data.js';
import { initTheme } from './theme.js';
import {
  renderList, renderSkeleton, renderState, textButton, toast,
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
};
const CATS = ['pure', 'applied'];
const LABEL = { pure: 'Pure', applied: 'Applied' };

const state = {
  topics: [],
  sig: '',
  tab: store.get('tab', 'pure') === 'applied' ? 'applied' : 'pure',
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
  count: $('#result-count'),
  chips: [...document.querySelectorAll('.chip')],
  offline: $('#offline-banner'),
  install: $('#install-banner'),
  lastUpdated: $('#last-updated'),
};

const haptic = () => { try { navigator.vibrate?.(8); } catch {} };

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
  const inTab = state.topics.filter((t) => t.category === state.tab);
  const withNotes = inTab.filter((t) => t.theory).length;
  const filtered = state.filter !== 'all' || tokens.length > 0;

  els.count.textContent = filtered
    ? `${items.length} ${items.length === 1 ? 'topic' : 'topics'} found`
    : `${inTab.length} topics · ${withNotes} with notes`;

  if (!items.length) {
    const other = CATS.find((c) => c !== state.tab);
    const otherCount = visible(other).length;
    const extra = otherCount ? textButton(`See ${otherCount} in ${LABEL[other]}`, () => setTab(other)) : null;
    renderState(els.list, {
      kind: 'empty',
      title: 'No topics found',
      text: tokens.length ? `Nothing matches “${state.query.trim()}” here. Try another word in Sinhala or English.` : 'No topics match this filter yet.',
      action: 'Clear search',
      onAction: clearAll,
      extra,
    });
    return;
  }
  renderList(els.list, items, tokens, { animate: anim });
}

function renderFooter() {
  const newest = state.topics.reduce((m, t) => (t.updated > m ? t.updated : m), '');
  els.lastUpdated.textContent = newest ? `Last updated ${formatDate(newest)}` : '';
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
    await animate(list, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-16 * dir}px)`, opacity: 0 }], { duration: fromSwipe ? 120 : 140 });
  }
  render({ animate: false });
  animate(list, [{ transform: `translateX(${20 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260 });
  if (window.scrollY > els.panel.offsetTop) {
    window.scrollTo({ top: Math.max(0, els.tabs.offsetTop - 70), behavior: prefersReduced() ? 'auto' : 'smooth' });
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
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - t0 < 600) {
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

let softPending = false;
async function softRender() {
  if (!state.loaded || softPending) return;
  softPending = true;
  await animate(els.list, [{ opacity: 1 }, { opacity: 0.3 }], { duration: 80 });
  softPending = false;
  render({ animate: false });
  animate(els.list, [{ opacity: 0.3 }, { opacity: 1 }], { duration: 200 });
}

/* ---------- Filter chips ---------- */
function setFilter(f) {
  if (!FILTERS[f]) f = 'all';
  state.filter = f;
  els.chips.forEach((c) => c.setAttribute('aria-checked', String(c.dataset.filter === f)));
  softRender();
}
els.chips.forEach((c) => c.addEventListener('click', () => { haptic(); setFilter(c.dataset.filter); }));

function clearAll() {
  setFilter('all');
  setQuery('');
}

/* ---------- Row tap: if only one resource exists, the whole row opens it ---------- */
els.list.addEventListener('click', (e) => {
  const row = e.target.closest('.row.single');
  if (!row || e.target.closest('a')) return;
  const href = row.dataset.href;
  if (href) window.open(href, '_blank', 'noopener,noreferrer');
});

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
        const row = els.list.querySelector(`[data-id="${CSS.escape(t.id)}"]`);
        if (row) {
          row.scrollIntoView({ block: 'center', behavior: prefersReduced() ? 'auto' : 'smooth' });
          animate(row, [{ backgroundColor: 'var(--accent-tint)' }, { backgroundColor: 'transparent' }], { duration: 1600, delay: 300 });
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

/* ---------- Scroll: hairline under header ---------- */
let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    els.header.classList.toggle('is-scrolled', window.scrollY > 4);
    ticking = false;
  });
}, { passive: true });

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
applyHash({ initial: true });
syncOnline();

const cached = readCache();
if (cached?.topics?.length) setData(cached.topics, cached.sig);
else renderSkeleton(els.list, 6);
load();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.loaded) load({ background: true });
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[CM Notez] SW registration failed', e));
  });
}
