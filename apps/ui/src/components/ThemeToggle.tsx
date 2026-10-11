import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tip } from './Tip';
import { load, save } from '../lib/storage';

type Theme = 'system' | 'light' | 'dark';

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

// index.html applies the saved theme before first paint.
export function ThemeToggle({ variant }: { variant: 'outline' | 'ghost' }) {
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
    <Tip content={`Theme: ${theme}`}>
      <Button type="button" variant={variant} size="icon-sm" onClick={change} aria-label={`Theme: ${theme}`}>
        <Icon />
      </Button>
    </Tip>
  );
}
