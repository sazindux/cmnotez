import { syncChrome, onThemeChanged } from './tg.js';

const KEY = 'cmn:theme';
const META = { dark: '#0F1419', light: '#FFFFFF' };
const CHROME = { dark: '#0F1419', light: '#F5F7FA' }; // = --bg of each theme

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function apply(theme, btn) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  document.getElementById('meta-theme')?.setAttribute('content', META[theme]);
  syncChrome(CHROME[theme]); // colour Telegram's own header/background to match
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
}

export function initTheme(btn, onChange) {
  apply(getTheme(), btn);

  btn.addEventListener('click', () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.add('theme-anim');
    apply(next, btn);
    try { localStorage.setItem(KEY, next); } catch {}
    onChange?.(next);
    clearTimeout(btn._t);
    btn._t = setTimeout(() => root.classList.remove('theme-anim'), 320);
  });

  // Follow the system only while the user hasn't chosen explicitly
  const mq = matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener?.('change', (e) => {
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch {}
    if (!stored) apply(e.matches ? 'light' : 'dark', btn);
  });

  // Inside Telegram: follow Telegram's theme until the user picks one explicitly
  onThemeChanged((scheme) => {
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch {}
    if (!stored && scheme) apply(scheme, btn);
  });
}
