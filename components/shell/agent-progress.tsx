import { Check, Circle, Loader2 } from 'lucide-react';
import type { PythonReport } from '@/lib/python-types';

export function AgentProgress({ report }: { report: PythonReport }) {
  const latest = report.measurements.at(-1);
  const stages = [
    { title: 'Project', active: /inspect|import|setup|queued|resum/i.test(report.stage), recorded: !!report.fingerprint, detail: report.fingerprint ? 'Source snapshot saved' : 'No snapshot recorded' },
    { title: 'Requirements', active: /analy|consistency/i.test(report.stage), recorded: !!report.analysis?.behaviors.length, detail: report.analysis ? `${report.analysis.behaviors.length} behaviors mapped` : 'No analysis recorded' },
    { title: 'Tests & review', active: /generate|review.*tests|improve tests/i.test(report.stage), recorded: report.tests.length > 0, detail: `${report.tests.filter(test => test.approved).length} approved / ${report.tests.length} artifacts` },
    { title: 'Execution', active: /execute|measure.*tests|measure behaviors/i.test(report.stage), recorded: !!latest, detail: latest ? `${latest.outcomes.length} outcomes recorded` : report.baseline ? 'Existing-suite baseline saved' : 'No suite execution recorded' },
    { title: 'Feedback', active: /diagnos|mutation|re-measure/i.test(report.stage), recorded: report.diagnoses.length + report.improvements.length + report.mutations.length > 0, detail: `${report.diagnoses.length} diagnoses / ${report.improvements.length} refinements` },
  ];
  return <div className="space-y-4" aria-label="Agent workflow">
    <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{stages.map(stage => {
      const active = report.status === 'running' && stage.active;
      const Icon = active ? Loader2 : stage.recorded ? Check : Circle;
      return <li key={stage.title} aria-current={active ? 'step' : undefined} className={'rounded-lg border p-3 ' + (active ? 'border-primary/50 bg-primary/5' : 'border-border bg-background/40')}><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Icon aria-hidden="true" className={'size-4 shrink-0 ' + (active ? 'animate-spin text-primary' : stage.recorded ? 'text-primary' : 'text-muted-foreground')} />{stage.title}</div><p className="text-xs leading-relaxed text-muted-foreground">{stage.detail}</p></li>;
    })}</ol>
    <p className="text-xs text-muted-foreground">Stages show saved artifacts, not a percentage of completion. Checks indicate a record exists, not that it passed.{report.replay && ' Saved-suite replay reuses earlier analysis and reviews.'}</p>
  </div>;
}
