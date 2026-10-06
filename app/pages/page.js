(() => {
  const root = document.documentElement;
  const next = { system: 'light', light: 'dark', dark: 'system' };
  const label = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };
  const button = document.querySelector('.theme');
  let theme = root.dataset.theme ?? 'system';
  const show = () => {
    button.textContent = theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark';
    button.setAttribute('aria-label', label[theme]);
  };
  show();
  button.addEventListener('click', () => {
    theme = next[theme];
    try {
      localStorage.setItem('devpul:theme', JSON.stringify(theme));
    } catch {}
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    show();
  });

  for (const pre of document.querySelectorAll('.doc pre')) {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? '');
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Failed';
      }
      setTimeout(() => (copy.textContent = 'Copy'), 1200);
    });
    pre.append(copy);
  }
})();
