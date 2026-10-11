import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { Approval } from '../../core/approvals';
import { marketUrl, pageUrl } from '../../lib/links';
import { type Offer, OfferText } from './PluginOffers';
import { PluginList } from './PluginList';

interface Props {
  offers: Offer[];
  approvals: Approval[];
  urls: string[];
  /** Files `devpul --plugin` serves. */
  served: string[];
  errors: Record<string, string>;
  writes: boolean;
  onWrites: (on: boolean) => void;
  onAllow: (offer: Offer) => void;
  onDismiss: (offer: Offer) => void;
  onApprovals: (approvals: Approval[]) => void;
  onUrls: (urls: string[]) => void;
}

const parseUrls = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/** Commits on blur, and on unmount: a tab switch can remove the field before it blurs. */
function PluginUrls({ urls, onCommit }: { urls: string[]; onCommit: (urls: string[]) => void }) {
  const [text, setText] = useState(urls.join('\n'));
  const draft = useRef<string | null>(null);
  const commitTo = useRef(onCommit);
  useEffect(() => {
    commitTo.current = onCommit;
  });
  const commit = useCallback(() => {
    if (draft.current === null) return;
    commitTo.current(parseUrls(draft.current));
    draft.current = null;
  }, []);
  useEffect(() => commit, [commit]);
  return (
    <Textarea
      className="font-mono text-xs"
      rows={3}
      value={text}
      spellCheck={false}
      placeholder="https://example.com/devpul-plugin.js"
      onChange={(e) => {
        draft.current = e.target.value;
        setText(e.target.value);
      }}
      onBlur={commit}
    />
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1.5 text-[13px] font-bold first:mt-0">{children}</h3>;
}

const LINK = 'text-primary hover:underline';

export function PluginsView(props: Props) {
  const { offers, approvals, urls, served, errors, writes, onWrites, onAllow, onDismiss, onApprovals, onUrls } = props;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Plugins" role="region">
      <div className="mx-auto max-w-190 px-4 py-3 [&_p]:my-1.5">
        {offers.length > 0 && (
          <>
            <Heading>Offered</Heading>
            <p>An allowed plugin runs in this page with access to every event from every app.</p>
            {offers.map((o) => (
              <div
                key={o.key}
                className="my-1.5 flex items-center gap-2.5 rounded-md border px-3 py-2 max-[560px]:flex-wrap"
              >
                <span className="min-w-0 flex-1 max-[560px]:basis-full">
                  <OfferText offer={o} />
                  {o.description && <span className="block text-muted-foreground">{o.description}</span>}
                </span>
                <Button type="button" size="xs" onClick={() => onAllow(o)}>
                  Allow
                </Button>
                {!o.dismissed && (
                  <Button type="button" variant="outline" size="xs" onClick={() => onDismiss(o)}>
                    Not now
                  </Button>
                )}
              </div>
            ))}
          </>
        )}

        <Heading>Installed</Heading>
        {approvals.length > 0 ? (
          <>
            <p>
              Allowed from apps, one source per plugin id; a changed plugin asks again. Disabled keeps the approval
              without loading the plugin.
            </p>
            <PluginList approvals={approvals} onChange={onApprovals} />
          </>
        ) : (
          <p className="text-muted-foreground">
            None yet. A running app offers the plugins it ships; allowed ones stay here.
          </p>
        )}

        <Heading>Writes</Heading>
        <label className="my-1.5 flex items-start gap-2.5">
          <Switch className="mt-0.5" checked={writes} onCheckedChange={onWrites} />
          <span>
            Allow writes
            <span className="block text-muted-foreground">
              Lets plugins change the app, such as editing a stored value. For every plugin and app, off each time
              DevPul loads.
            </span>
          </span>
        </label>

        {Object.keys(errors).length > 0 && (
          <>
            <Heading>Load errors</Heading>
            {Object.entries(errors).map(([origin, err]) => (
              <p key={origin} className="text-destructive">
                <code>{origin}</code>: {err}
              </p>
            ))}
          </>
        )}

        <Heading>Get plugins</Heading>
        <p>
          Add one from the app's folder with <code>devpul add &lt;id&gt;</code>, then run the app; it offers the plugin
          here.
        </p>
        <p className="flex flex-wrap gap-x-4">
          <a className={LINK} href={marketUrl} target="_blank" rel="noopener">
            Browse plugins
          </a>
          <a className={LINK} href={pageUrl('docs/plugins/install/')} target="_blank" rel="noopener">
            Installing plugins
          </a>
          <a className={LINK} href={pageUrl('docs/plugins/')} target="_blank" rel="noopener">
            Writing plugins
          </a>
        </p>

        <Heading>Module URLs</Heading>
        <label className="my-1.5 flex flex-col gap-1">
          One per line. They run with full access to this page, without asking.
          <PluginUrls urls={urls} onCommit={onUrls} />
        </label>
        {served.length > 0 && (
          <>
            <p>Served by devpul --plugin:</p>
            {served.map((url) => (
              <p key={url} className="font-mono text-xs wrap-anywhere text-muted-foreground">
                {url}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
