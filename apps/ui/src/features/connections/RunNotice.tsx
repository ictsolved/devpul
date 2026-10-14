import { Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pageUrl } from '../../lib/links';
import { useStored } from '../../lib/storage';

// DevTools served by the run's DDS, under the run's token: a new origin, and so empty storage, every run.
const perRun = /=\/devtools\//.test(location.pathname);

export function RunNotice() {
  const [closed, setClosed] = useStored('runNoticeClosed', false);
  if (!perRun || closed) return null;
  return (
    <div role="note" className="flex items-center gap-2.5 border-b bg-secondary px-3 py-1 text-xs">
      <Info size={14} className="flex-none" />
      <span className="min-w-0 flex-1">
        This DevTools is new every run, so settings, history and plugin approvals start over.{' '}
        <a
          className="font-bold text-primary hover:underline"
          href={pageUrl('docs/cli/#devpul-run')}
          target="_blank"
          rel="noopener"
        >
          devpul run
        </a>{' '}
        keeps them.
      </span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Close" onClick={() => setClosed(true)}>
        <X />
      </Button>
    </div>
  );
}
