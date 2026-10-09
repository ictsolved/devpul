import { Check, Copy } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { devtools, postHost } from '../lib/devtools';

export async function copyText(text: string): Promise<boolean> {
  // IDE webviews block the clipboard API; DevTools copies for its extensions.
  if (devtools) {
    postHost('copyToClipboard', { content: text, successMessage: 'Copied' });
    return true;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

interface Props {
  text: () => string;
  label?: string;
  icon?: ReactNode;
}

export function CopyButton({ text, label = 'Copy', icon }: Props) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={async (e) => {
        e.stopPropagation();
        setState((await copyText(text())) ? 'ok' : 'fail');
        setTimeout(() => setState('idle'), 1200);
      }}
    >
      {state === 'ok' ? <Check /> : (icon ?? <Copy />)}
      {state === 'ok' ? 'Copied' : state === 'fail' ? 'Failed' : label}
    </Button>
  );
}
