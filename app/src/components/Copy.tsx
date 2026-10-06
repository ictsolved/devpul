import { Check, Copy } from 'lucide-react';
import { type ReactNode, useState } from 'react';

export async function copyText(text: string): Promise<boolean> {
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
    <button
      type="button"
      className="btn small"
      onClick={async (e) => {
        e.stopPropagation();
        setState((await copyText(text())) ? 'ok' : 'fail');
        setTimeout(() => setState('idle'), 1200);
      }}
    >
      {state === 'ok' ? <Check size={13} /> : (icon ?? <Copy size={13} />)}
      {state === 'ok' ? 'Copied' : state === 'fail' ? 'Failed' : label}
    </button>
  );
}
