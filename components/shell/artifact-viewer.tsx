"use client";

import { useState } from "react";
import { Download, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { CaseResult, VerificationReport } from "@/lib/verification";
import type { AgentArtifact } from "@/lib/types";

const outcomes = {
  passed: { label: "Passed", color: "text-emerald-400" },
  failed: { label: "Failed", color: "text-red-400" },
  blocked: { label: "Blocked", color: "text-amber-300" },
  error: { label: "Execution errors", color: "text-amber-300" },
} as const;
type Status = CaseResult["status"];
const valueText = (value: unknown) => JSON.stringify(value) ?? "Unavailable";

export function ArtifactViewer({ artifacts, report }: { artifacts: AgentArtifact[]; report?: VerificationReport }) {
  const [filter, setFilter] = useState<Status | "all">("all");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  if (!report) return null;
  const visible = report.results.filter((result) => filter === "all" || result.status === filter);
  const checked = report.rules.length - report.uncoveredRuleIds.length;
  const coverage = report.rules.length ? checked / report.rules.length * 100 : 0;
  const summary = artifacts.find((artifact) => artifact.id === "summary")?.content || report.summary;
  async function copySummary() {
    setCopyError(false);
    try { await navigator.clipboard.writeText(summary); setCopied(true); }
    catch { setCopyError(true); return; }
    setTimeout(() => setCopied(false), 2000);
  }
  function download(artifact: AgentArtifact) {
    const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.type === "json" ? "application/json" : "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = artifact.name; link.click(); URL.revokeObjectURL(url);
  }
  return (
    <section aria-label="Test results" className="space-y-8">
      <header className="flex flex-wrap justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold">{report.conclusion === "passed" ? "Listed cases passed" : report.conclusion === "failed" ? "Output mismatches found" : "Verification is incomplete"}</h2>
          <p className="text-sm text-muted-foreground">{report.results.length} cases · {report.rules.length} requirements · {(report.elapsedMs / 1000).toFixed(1)}s · {report.model}</p>
        </div>
        <Button variant="outline" onClick={copySummary}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy summary"}</Button>
      </header>
      {copyError && <p role="alert" className="text-red-400">Clipboard access failed. Use Download report.</p>}
      <div aria-label="Case outcomes" className="grid grid-cols-2 gap-4 md:grid-cols-4 border-y py-3">
        {(Object.keys(outcomes) as Status[]).map((status) => {
          const count = report.results.filter((result) => result.status === status).length;
          return <Button key={status} variant={filter === status ? "secondary" : "ghost"} disabled={!count} aria-label={outcomes[status].label + ": " + count}
            aria-pressed={filter === status} onClick={() => setFilter(filter === status ? "all" : status)} className="h-auto flex-col items-start px-3 py-2">
            <strong className={`text-3xl ${outcomes[status].color}`}>{count}</strong>{outcomes[status].label}
          </Button>;
        })}
      </div>
      <section aria-label="Requirement checks" className="space-y-4">
        <h3 className="text-xl font-bold">Requirements with completed checks {checked} / {report.rules.length}</h3>
        <Progress value={coverage} aria-valuenow={coverage} aria-label="Requirements with completed checks" />
        <ul className="divide-y">
          {report.rules.map((rule) => {
            const missing = report.uncoveredRuleIds.includes(rule.id);
            const failed = report.results.some((result) => result.ruleId === rule.id && result.status === "failed");
            return <li key={rule.id} className="grid gap-2 py-4 sm:grid-cols-[3rem_1fr_auto] text-sm">
              <strong>{rule.id}</strong>
              <div>{rule.text}{missing && <p className="mt-2 text-amber-300">{report.review.coverage.find((item) => item.ruleId === rule.id)?.reason || "No complete supported checks."}</p>}</div>
              <strong className={failed ? "text-red-400" : missing ? "text-amber-300" : "text-emerald-400"}>{failed ? "Mismatch" : missing ? "Needs review" : "Checks passed"}</strong>
            </li>;
          })}
        </ul>
      </section>
      <section aria-label="Expected and observed outputs" className="space-y-4">
        <div className="flex justify-between items-center gap-3">
          <h3 className="text-xl font-bold">Expected vs observed · {visible.length} cases</h3>
          {filter !== "all" && <Button variant="link" className="text-blue-300" onClick={() => setFilter("all")}>Show all cases</Button>}
        </div>
        <Table className="min-w-[620px]">
          <TableHeader><TableRow><TableHead>Case / Input</TableHead><TableHead>Expected</TableHead><TableHead>Observed</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
          <TableBody>
            {visible.map((result) => {
              const test = report.cases.find((item) => item.id === result.caseId);
              return <TableRow key={result.caseId}>
                <TableCell className="whitespace-normal">
                  <strong>{test?.title || result.caseId}</strong>
                  <p className="mt-1 text-muted-foreground">{result.ruleId} · {test?.query.map((item) => item.name + " = " + item.value).join(", ") || "No query parameters"}</p>
                  <details className="mt-2 text-muted-foreground">
                    <summary className="cursor-pointer">Why / HTTP evidence</summary>
                    <p>{result.reason}</p><p>Review: {report.review.decisions.find((item) => item.caseId === result.caseId)?.reason}</p>
                    {result.request && <p className="break-all">{result.request.method} {result.request.url}{result.request.bodyJson && " · " + result.request.bodyJson}</p>}
                    {result.response && <p className="break-all">HTTP {result.response.status} · {result.response.body}</p>}
                  </details>
                </TableCell>
                <TableCell>{result.checks?.map((check) => <p key={check.label}>{check.label}: {valueText(check.expected)}</p>) || "Not checked"}</TableCell>
                <TableCell>{result.checks?.map((check) => <p key={check.label} className={check.passed ? "" : "text-red-400"}>{check.label}: {valueText(check.actual)}</p>) || "Not run"}</TableCell>
                <TableCell className="whitespace-normal"><strong className={outcomes[result.status].color}>{outcomes[result.status].label}</strong>{result.status !== "passed" && <p className="mt-2">{result.reason}</p>}</TableCell>
              </TableRow>;
            })}
            {!visible.length && <TableRow><TableCell colSpan={4}>No cases to display. Check the requirement review above.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </section>
      <footer className="flex flex-wrap gap-3 border-t pt-6">
        {artifacts.map((artifact) => <Button key={artifact.id} variant="outline" onClick={() => download(artifact)}><Download />{artifact.type === "code" ? "Download tests" : artifact.type === "json" ? "Download evidence" : "Download report"}</Button>)}
      </footer>
    </section>
  );
}
