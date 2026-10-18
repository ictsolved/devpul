import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { kvClass } from '../../components/JsonView';
import { isObject } from '../../core/events';
import { deviceRows, parseScreenshot, type Report } from '../../core/export';
import { formatDateTime } from '../../core/json';
import type { RunInfo } from '../../core/store';
import { handles } from '../http/useMocks';

export const SCREENSHOT = 'flutter.screenshot';
export const DEVICE = 'flutter.device';

export interface ReportApp {
  run: RunInfo;
  name: string;
}

interface Props {
  open: boolean;
  /** A report from a file; without one the dialog takes a report from [apps]. */
  opened?: { report: Report; app: string };
  apps: ReportApp[];
  call: (run: string, handler: string) => Promise<unknown>;
  onSave: (report: Report) => void;
  onClose: () => void;
}

export function ReportDialog({ open, opened, apps, call, onSave, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100vh-48px)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-190">
        <DialogHeader>
          <DialogTitle>Bug report</DialogTitle>
          <DialogDescription>
            {opened
              ? `${opened.app}, taken ${formatDateTime(opened.report.ts)}.`
              : 'Every event on the page with a screenshot and the device, in one file to attach to an issue. It opens here like a session file.'}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per opening, so a report is taken each time. */}
        {opened ? <ReportView report={opened.report} /> : <TakePanel apps={apps} call={call} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function TakePanel({ apps, call, onSave }: Pick<Props, 'apps' | 'call' | 'onSave'>) {
  const [picked, setPicked] = useState(apps[0]?.run.run);
  const [taken, setTaken] = useState<{ run: string; report: Report; error?: string }>();
  const app = apps.find((a) => a.run.run === picked) ?? apps[0];
  const runId = app?.run.run;
  const shoots = !!app && handles(app.run, SCREENSHOT);
  const describes = !!app && handles(app.run, DEVICE);

  useEffect(() => {
    if (!runId) return;
    let live = true;
    const ts = Date.now();
    const ask = (on: boolean, handler: string) => (on ? call(runId, handler) : Promise.resolve(undefined));
    void Promise.allSettled([ask(shoots, SCREENSHOT), ask(describes, DEVICE)]).then(([shot, device]) => {
      if (!live) return;
      const screenshot = shot.status === 'fulfilled' ? parseScreenshot(shot.value) : undefined;
      const failed = [shot, device].find((r) => r.status === 'rejected');
      setTaken({
        run: runId,
        report: {
          ts,
          run: runId,
          ...(screenshot && { screenshot }),
          ...(device.status === 'fulfilled' && isObject(device.value) && { device: device.value }),
        },
        ...(failed && { error: failed.reason instanceof Error ? failed.reason.message : String(failed.reason) }),
      });
    });
    return () => {
      live = false;
    };
    // The call changes with every event; a report is taken once per app.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, shoots, describes]);

  if (!app) {
    return <p className="text-[13px] text-muted-foreground">Connect the app to take a bug report.</p>;
  }
  const report = taken?.run === app.run.run ? taken : undefined;
  return (
    <div className="-mx-6 flex flex-col gap-3 overflow-y-auto px-6 text-[13px]">
      {apps.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          App
          <NativeSelect value={app.run.run} onChange={(e) => setPicked(e.target.value)}>
            {apps.map((a) => (
              <NativeSelectOption key={a.run.run} value={a.run.run}>
                {a.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      )}
      {!shoots && (
        <p className="text-muted-foreground">
          The file holds the events only. Apps with devpul_flutter 1.1 or later and DevpulFlutter.install() add a
          screenshot and the device.
        </p>
      )}
      {report?.error && <p className="text-destructive">{report.error}</p>}
      {report ? (
        <ReportView report={report.report} />
      ) : (
        shoots && <p className="text-muted-foreground">Taking a screenshot...</p>
      )}
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={!report} onClick={() => report && onSave(report.report)}>
          Save report
        </Button>
      </div>
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  const rows = report.device ? deviceRows(report.device) : [];
  if (!report.screenshot && !rows.length) return null;
  return (
    <div className="flex min-h-0 gap-4 overflow-y-auto text-[13px] max-sm:flex-col">
      {report.screenshot && (
        <img
          src={report.screenshot.image}
          alt="Screenshot of the app"
          width={report.screenshot.width}
          height={report.screenshot.height}
          className="h-auto max-h-[60vh] w-auto max-w-full self-start rounded-md border object-contain sm:max-w-[55%]"
        />
      )}
      {rows.length > 0 && (
        <table className={kvClass.table}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th className={kvClass.key}>{k}</th>
                <td className={kvClass.value}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
