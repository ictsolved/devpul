import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/** A section heading that hides what is rarely needed until opened. */
export function Fold({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group/fold mt-4" open={open}>
      <summary className="mb-1.5 flex w-fit cursor-pointer list-none items-center gap-1 text-[13px] font-bold select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={14}
          className="text-muted-foreground transition-transform group-open/fold:rotate-90"
          aria-hidden
        />
        {title}
      </summary>
      {children}
    </details>
  );
}
