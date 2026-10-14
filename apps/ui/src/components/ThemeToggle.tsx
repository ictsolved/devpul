import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tip } from './Tip';
import { load, save } from '../lib/storage';

export type Theme = 'system' | 'light' | 'dark';

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
export const THEME_NAME: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

// index.html applies the saved theme before first paint.
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => load<Theme>('theme', 'system'));
  const change = (next: Theme) => {
    setTheme(next);
    save('theme', next);
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  };
  return [theme, change];
}

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <Tip content={`Theme: ${THEME_NAME[theme]}`}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => setTheme(NEXT[theme])}
        aria-label={`Theme: ${THEME_NAME[theme]}`}
      >
        <Icon />
      </Button>
    </Tip>
  );
}
