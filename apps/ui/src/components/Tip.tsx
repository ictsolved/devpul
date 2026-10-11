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
  side?: 'top' | 'bottom';
  /** Stays open while the pointer is over it, so long content can scroll. */
  hoverable?: boolean;
  children: ReactElement;
}

export function Tip({ content, code, whenCut, align, side = 'bottom', hoverable, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const cut = () => !!ref.current && ref.current.scrollWidth > ref.current.clientWidth;
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => setOpen(next && (!whenCut || cut()))}
      disableHoverableContent={!hoverable}
    >
      {/* Typing in a field with a tip hides it. */}
      <TooltipTrigger asChild ref={ref as Ref<HTMLButtonElement>} onKeyDown={() => setOpen(false)}>
        {children}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={4}
        className={cn(
          'max-h-[60vh] max-w-80 overflow-y-auto whitespace-pre-line wrap-break-word',
          code && 'max-w-160 font-mono text-wrap whitespace-pre-wrap wrap-anywhere',
        )}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
