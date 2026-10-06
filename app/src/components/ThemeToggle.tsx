import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { load, save } from '../lib/storage';

type Theme = 'system' | 'light' | 'dark';

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

// index.html applies the saved theme before first paint.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => load<Theme>('theme', 'system'));
  const change = () => {
    const next = NEXT[theme];
    setTheme(next);
    save('theme', next);
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button
      type="button"
      className="btn icon"
      onClick={change}
      aria-label={`Theme: ${theme}`}
      data-tip={`Theme: ${theme}`}
    >
      <Icon size={14} />
    </button>
  );
}
