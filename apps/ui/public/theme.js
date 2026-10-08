try {
  const t = JSON.parse(localStorage.getItem('devpul:theme'));
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {}
