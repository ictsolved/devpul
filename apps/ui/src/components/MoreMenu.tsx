import { CircleHelp, EllipsisVertical, Keyboard, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type Theme, THEME_NAME, useTheme } from './ThemeToggle';
import { Tip } from './Tip';

interface Props {
  /** Items above the rest. */
  children?: ReactNode;
  helpUrl: string;
  /** DevTools sets the theme. */
  themes: boolean;
  onSettings: () => void;
  onShortcuts: () => void;
}

export function MoreMenu({ children, helpUrl, themes, onSettings, onShortcuts }: Props) {
  const [theme, setTheme] = useTheme();
  return (
    <DropdownMenu>
      <Tip content="More">
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="More">
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="min-w-50">
        {children && (
          <>
            {children}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={onSettings}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={helpUrl} target="_blank" rel="noopener">
            <CircleHelp /> Help
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onShortcuts}>
          <Keyboard /> Shortcuts
        </DropdownMenuItem>
        {themes && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              {(['system', 'light', 'dark'] as const).map((t) => (
                <DropdownMenuRadioItem key={t} value={t}>
                  {THEME_NAME[t]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
