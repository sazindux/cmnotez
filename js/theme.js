const KEY = 'cmn:theme';
const META = { dark: '#17212B', light: '#FFFFFF' };

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function apply(theme, btn) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  document.getElementById('meta-theme')?.setAttribute('content', META[theme]);
  if (btn) {
    btn.setAttribute('aria-checked', String(theme === 'dark'));
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
}
