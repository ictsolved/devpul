import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface Props {
  value: number | null;
  min: number;
  onCommit: (v: number) => void;
  /** Lets the field be empty; called when it is emptied. */
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Digits only, no spinner; commits a changed value on blur or Enter. Key it by value to reset. */
export function NumberField({ value, min, onCommit, onClear, ...rest }: Props) {
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  const commit = () => {
    if (text === '' && onClear) {
      if (value !== null) onClear();
      return;
    }
    const n = Number.parseInt(text, 10);
    if (Number.isFinite(n) && n >= min) {
      if (n !== value) onCommit(n);
    } else setText(shown);
  };
  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
