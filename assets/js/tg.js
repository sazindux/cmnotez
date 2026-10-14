/* Telegram Mini App (Web App) integration.
 *
 * Why this exists:
 *  - Plain <a target="_blank"> / window.open() inside a Mini App makes Telegram spawn a
 *    second in-app-browser WebView. On devices with a faulty Android System WebView build
 *    that crashes Telegram ("The installed version of WebView caused Telegram to crash").
 *  - t.me links are handed to Telegram itself (openTelegramLink): they open natively,
 *    no browser WebView is created at all.
 *  - Any other link goes to the system browser (openLink + try_browser).
 *
 * Outside Telegram (normal browser / installed PWA) everything below is a no-op and
 * links behave exactly as before.
 */

const tg = window.Telegram && window.Telegram.WebApp;

/** True only when really running inside Telegram (the SDK also loads in a normal browser). */
export const inTelegram = !!(tg && tg.platform && tg.platform !== 'unknown');

const atLeast = (v) => { try { return !!tg.isVersionAtLeast(v); } catch { return false; } };
const TG_HOSTS = new Set(['t.me', 'telegram.me', 'telegram.dog']);

/** https://t.me/... form of a Telegram link, or '' if the URL is not a Telegram link. */
function asTelegramLink(url) {
  try {
    const u = new URL(url, location.href);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && TG_HOSTS.has(u.hostname)) {
      return `https://t.me${u.pathname}${u.search}${u.hash}`;
    }
  } catch { /* ignore */ }
  return '';
}

/** Try to open a link through Telegram. Returns true if Telegram took it. */
function openViaTelegram(url) {
  if (!inTelegram || !atLeast('6.1')) return false;
  try {
    const t = asTelegramLink(url);
    if (t) tg.openTelegramLink(t);
    else tg.openLink(url, { try_browser: true });
    return true;
  } catch (err) {
    console.warn('[CM Notez] Telegram link open failed, falling back:', err);
    return false;
  }
}

/** Open any http(s) URL the safest way for the current environment. */
export function openUrl(url) {
  if (openViaTelegram(url)) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Intercept every external <a> click so it never opens a nested WebView inside Telegram. */
function bindLinks() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !/^https?:$/.test(a.protocol) || a.origin === location.origin) return;
    if (openViaTelegram(a.href)) e.preventDefault();
  });
}

/** Match Telegram's own header / background / bottom bar to the app theme. */
export function syncChrome(color) {
  if (!inTelegram || !color) return;
  try {
    if (atLeast('6.1')) tg.setBackgroundColor(color);
    if (atLeast('6.9')) tg.setHeaderColor(color);
    if (atLeast('7.10')) tg.setBottomBarColor(color);
  } catch { /* ignore */ }
}

/** Telegram's current colour scheme ('light' | 'dark') or '' outside Telegram. */
export const colorScheme = () => (inTelegram && (tg.colorScheme === 'light' || tg.colorScheme === 'dark') ? tg.colorScheme : '');

export function onThemeChanged(fn) {
  if (!inTelegram) return;
  try { tg.onEvent('themeChanged', () => fn(colorScheme())); } catch { /* ignore */ }
}

/** Optional deep link: t.me/<bot>/<app>?startapp=applied | pure | a05 | topic_a05 */
export function startParam() {
  if (!inTelegram) return {};
  let p = '';
  try { p = (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || ''; } catch { /* ignore */ }
  p = String(p).toLowerCase();
  if (p === 'pure' || p === 'applied') return { tab: p };
  const m = /^(?:topic[_-])?([pa]\d+)$/.exec(p);
  return m ? { topic: m[1] } : {};
}

export function initTelegram() {
  if (!inTelegram) return;
  document.documentElement.classList.add('tg');
  try {
    tg.ready();
    tg.expand();
  } catch { /* ignore */ }
  bindLinks();
}
