import { cn } from 'cn';
import { ArrowLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** A list with an optional detail beside it; in narrow windows the detail covers the list. */
export function Split({ detail, children }: { detail: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]',
        detail &&
          'grid-cols-[minmax(0,1fr)_minmax(320px,45%)] max-[860px]:relative max-[860px]:grid-cols-[minmax(0,1fr)]',
      )}
    >
      <div className="@container flex min-h-0 min-w-0 flex-col">{children}</div>
      {detail}
    </div>
  );
}

interface DetailProps {
  label: string;
  head: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function Detail({ label, head, onClose, children }: DetailProps) {
  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col border-l bg-card max-[860px]:absolute max-[860px]:inset-0 max-[860px]:z-5 max-[860px]:border-l-0"
      aria-label={label}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {head}
        <Button type="button" variant="outline" size="icon-xs" onClick={onClose} aria-label="Close detail">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pt-1 pb-6">{children}</div>
    </aside>
  );
}

/** Returns to the error a detail was opened from. */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="xs" onClick={onClick}>
      <ArrowLeft />
      Back to error
    </Button>
  );
}
