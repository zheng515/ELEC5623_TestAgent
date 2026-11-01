import type { PythonReport, TestAttempt } from '@/lib/python-types';
import { agentStopReason, improvementOutcomes } from '@/lib/run-evaluation';
import { requestUsage } from '@/lib/verification-policy';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const labels: Record<TestAttempt['status'], string> = {
  proposed: 'Awaiting review', reviewed: 'Reviewed; application not recorded',
  applied: 'Applied', rejected: 'Not admitted', failed: 'Request failed',
};

export function AgentChanges({ report }: { report: PythonReport }) {
  const changes = improvementOutcomes(report);
  if (!changes.length) return null;
  return <Card className="shadow-none">
    <CardHeader><CardTitle role="heading" aria-level={3}>What changed after feedback</CardTitle><p className="text-sm text-muted-foreground">{changes.filter(change => change.recovered).length} previously failing or erroneous test files now pass · {changes.length} changed or added files.</p></CardHeader>
    <CardContent className="space-y-4 text-sm">
      <p className="text-muted-foreground">Recorded before and after results for changed tests. A passing revision is not independent proof that the correction is valid.</p>
      <div className="max-h-64 overflow-auto" role="region" aria-label="Changed test results" tabIndex={0}><table className="w-full text-left"><caption className="sr-only">Changed test files before and after feedback</caption><thead><tr className="border-b border-border"><th scope="col" className="p-2">Test</th><th scope="col" className="p-2">Before</th><th scope="col" className="p-2">After</th></tr></thead><tbody>{changes.map(change => <tr key={change.id} className="border-b border-border"><th scope="row" className="p-2 font-medium">{change.id}</th><td className="p-2">{change.before}</td><td className="p-2">{change.after}</td></tr>)}</tbody></table></div>
      <details><summary className="cursor-pointer font-medium">Inspect changed assertions</summary><p className="my-3 text-muted-foreground">{report.improvements[0].reason}</p>{changes.map(change => <details key={change.id} className="my-3 rounded-lg border border-border p-3"><summary className="cursor-pointer">{change.id} · {change.purpose}</summary><h4 className="mt-3 font-medium">Before</h4>{change.previous ? <pre className="my-2 text-xs">{change.previous.code}</pre> : <p>No earlier proposal for this ID.</p>}<h4 className="mt-3 font-medium">After</h4><pre className="my-2 text-xs">{change.test.code}</pre><p className="text-muted-foreground">{change.test.review || 'No review explanation recorded.'}</p></details>)}</details>
    </CardContent>
  </Card>;
}

export function AgentDecisions({ report }: { report: PythonReport }) {
  const rounds = report.testAttempts?.length || 0;
  return <details id="agent-decisions" className="border border-border bg-card rounded-xl p-5">
    <summary className="cursor-pointer font-semibold">Agent decisions · {rounds} recorded {rounds === 1 ? 'round' : 'rounds'}</summary>
    <div className="mt-4 space-y-4 text-sm">
      <p><strong>{report.status === 'running' ? 'Current action: ' : 'Why the Agent stopped: '}</strong>{agentStopReason(report)}</p>
      <p className="text-muted-foreground">Applied means accepted into the active suite, not passed. Only approved tests can execute. Review decisions explain admission; they are not independent correctness labels.</p>
      {report.replay && <p>This run reused saved reviews. Open the original run to inspect its proposal history.</p>}
      {report.resources && <details><summary>Model requests · {requestUsage(report).used}/{report.resources.limit ?? 'no limit'}{report.resources.exhausted ? ' · budget exhausted' : ''}</summary>
        <p className="mt-2">Provider-reported tokens: {requestUsage(report).reportedTokens}. Usage is unavailable for {requestUsage(report).unknownUsage} requests; it is not counted as zero. Cached responses do not consume another request. Interrupted requests remain charged to the request limit.</p>
        {report.resources.requests.map((request, index) => <p key={index}>{index + 1}. {request.stage} · {request.status === 'started' ? 'Completion not recorded' : request.status} · {request.totalTokens === undefined ? 'tokens unavailable' : `${request.totalTokens} tokens`}</p>)}
      </details>}
      {!report.replay && !report.testAttempts?.length && <p>No proposal history was recorded. Earlier runs may contain only final tests and reviews.</p>}
      {report.testAttempts?.map((attempt, index) => <section key={index} className="border-l-2 border-primary pl-4 space-y-2">
        <h3 className="font-semibold">Round {index + 1} · {attempt.phase === 'generation' ? 'Initial generation' : 'One improvement'} · {labels[attempt.status]}</h3>
        <p>{attempt.reason}</p>
        {attempt.error && <p role="status">Request error: {attempt.error}</p>}
        {!attempt.tests.length && <p>No test proposal was returned in this round.</p>}
        {attempt.tests.map((test, testIndex) => <details key={testIndex} className="border border-border rounded-lg p-3">
          <summary className="cursor-pointer">{test.id} · {test.behaviorId} · {test.approved ? 'Approved' : test.review ? 'Not admitted' : 'No approval recorded'}</summary>
          <div className="mt-2 space-y-2"><p>{test.purpose}</p><p>{test.review || 'No completed admission review was recorded.'}</p>
            <details><summary>Proposed code</summary><pre className="mt-2 text-xs">{test.code}</pre></details>
          </div>
        </details>)}
        {attempt.decisions && <details><summary>Model review responses ({attempt.decisions.length})</summary>
          {attempt.decisions.map((decision, i) => <div key={i} className="mt-2 space-y-1"><p>{decision.testId} · {decision.supported ? 'Supported by model review' : 'Unsupported by model review'}</p><p>{decision.reason}</p><blockquote className="border-l pl-3 text-muted-foreground">{decision.quote}</blockquote></div>)}
          <p className="mt-2 text-muted-foreground">Server admission checks also apply. A model approval alone does not admit a test.</p>
        </details>}
        {!!attempt.coverage?.length && <details><summary>Original requirement coverage ({attempt.coverage.length})</summary>
          <p className="mt-2 text-muted-foreground">This model assessment compares the suite with the original requirements, including explicit examples. It is not independent proof of correctness.</p>
          {attempt.coverage.map((review, i) => <div key={i} className="mt-2 space-y-1">
            <p>{review.ruleId} · {review.complete ? 'Model reports explicit examples covered' : 'Coverage incomplete'}</p><p>{review.reason}</p>
            {review.missingExamples.map((example, j) => <blockquote key={j} className="border-l pl-3 text-muted-foreground">{example}</blockquote>)}
          </div>)}
        </details>}
      </section>)}
    </div>
  </details>;
}
