import { cn } from 'cn';
import { type ReactElement, type ReactNode, type Ref, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  content: ReactNode;
  /** Monospace and wider, for URLs, JSON and filter syntax. */
  code?: boolean;
  /** Shown only while the trigger's text is cut off, for a tip that repeats it. */
  whenCut?: boolean;
  align?: 'start' | 'center' | 'end';
  children: ReactElement;
}

export function Tip({ content, code, whenCut, align, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const cut = () => !!ref.current && ref.current.scrollWidth > ref.current.clientWidth;
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && (!whenCut || cut()))}>
      {/* Typing in a field with a tip hides it. */}
      <TooltipTrigger asChild ref={ref as Ref<HTMLButtonElement>} onKeyDown={() => setOpen(false)}>
        {children}
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align={align}
        sideOffset={4}
        className={cn(
          'max-h-[60vh] max-w-80 overflow-hidden whitespace-pre-line wrap-break-word',
          code && 'max-w-160 font-mono text-wrap whitespace-pre-wrap wrap-anywhere',
        )}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
