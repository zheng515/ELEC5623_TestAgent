"use client";

import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PythonReport } from '@/lib/python-types';
import { findingEvidence, diagnosisLabels } from '@/lib/finding-evidence';
import { ruleSources } from '@/lib/requirement-input';
import { OriginalPageLink, OcrConfidence } from './document-extraction';

export function FindingEvidence({ report, selectedNode, onSelect }: { report: PythonReport; selectedNode: string; onSelect: (node: string) => void }) {
  const findings = findingEvidence(report);
  const finding = findings.find(item => item.outcome.node === selectedNode) || findings[0];
  if (!finding) return null;
  const { outcome, test, rule, diagnosis } = finding;
  const screenshot = outcome.screenshot && '/api/python/screenshot?run=' + encodeURIComponent(report.id) + '&file=' + encodeURIComponent(outcome.screenshot);
  return <Card id="finding-evidence" className="scroll-mt-6 overflow-hidden shadow-none">
    <CardHeader className="border-b border-border">
      <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle role="heading" aria-level={2}>Finding evidence</CardTitle><Badge variant="outline">Latest recorded execution</Badge></div>
      <p className="text-sm text-muted-foreground">Follow the saved requirement, test, execution and assessment. Missing links remain explicit.</p>
      {findings.length > 1 && <label className="mt-3 block space-y-2 text-sm">Select a finding<NativeSelect aria-label="Select a finding" value={outcome.node} onChange={event => onSelect(event.target.value)}>{findings.map(item => <NativeSelectOption key={item.outcome.node} value={item.outcome.node}>{item.outcome.status} · {item.test?.purpose || item.outcome.name || item.outcome.node}</NativeSelectOption>)}</NativeSelect></label>}
    </CardHeader>
    <CardContent className="space-y-5 pt-5">
      <div className="space-y-2"><div className="flex flex-wrap gap-2"><Badge variant="destructive">{outcome.status}</Badge>{rule && <Badge variant="outline">{rule.originalId || rule.id}</Badge>}<Badge variant="secondary">{diagnosis ? diagnosisLabels[diagnosis.category] : 'Cause not established'}</Badge></div><h3 className="text-lg font-semibold">{test?.purpose || outcome.name || 'Execution needs investigation'}</h3><p className="break-all font-mono text-xs text-muted-foreground">{outcome.node}</p></div>
      <Tabs key={report.id + ':' + outcome.node} defaultValue="execution">
        <TabsList aria-label="Finding evidence trail" className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/50 p-1 sm:grid-cols-4">
          <TabsTrigger value="requirement" className="px-2 py-2 text-xs sm:text-sm">Requirement</TabsTrigger><TabsTrigger value="test" className="px-2 py-2 text-xs sm:text-sm">Test artifact</TabsTrigger><TabsTrigger value="execution" className="px-2 py-2 text-xs sm:text-sm">Execution</TabsTrigger><TabsTrigger value="assessment" className="px-2 py-2 text-xs sm:text-sm">Agent assessment</TabsTrigger>
        </TabsList>
        <TabsContent value="requirement" className="mt-5 space-y-4"><h4 className="font-medium">Original requirement</h4>{rule ? <><blockquote className="border-l-2 border-primary pl-4 text-sm leading-relaxed whitespace-pre-wrap">{rule.text}</blockquote>{ruleSources(rule).map(source => <p key={source.segmentId + ':' + (source.start || 0)} className="text-xs text-muted-foreground">{source.fileName} · {source.location}<OriginalPageLink documentId={source.documentId} page={source.page} /><OcrConfidence source={source} /></p>)}</> : <p className="text-sm text-muted-foreground">No unique requirement link was recorded for this execution. Inspect the test and source before assigning a cause.</p>}</TabsContent>
        <TabsContent value="test" className="mt-5 space-y-4"><h4 className="font-medium">Saved test artifact</h4>{test ? <><p className="text-sm text-muted-foreground">{test.id} · {test.behaviorId} · Approved for execution</p><pre className="rounded-lg bg-background p-4 text-xs">{test.code}</pre><p className="text-sm text-muted-foreground">Admission review: {test.review || 'No review explanation recorded.'}</p></> : <p className="text-sm text-muted-foreground">This is an existing check or has no unique generated-test link. The execution record remains available.</p>}</TabsContent>
        <TabsContent value="execution" className="mt-5 space-y-4"><h4 className="font-medium">Recorded execution output</h4><pre className="rounded-lg bg-background p-4 text-xs">{outcome.message || 'No diagnostic message recorded.'}</pre>{screenshot && <a href={screenshot} target="_blank" rel="noreferrer"><Image unoptimized src={screenshot} width={640} height={400} className="h-auto max-w-full rounded-lg border border-border" alt={'Browser page recorded for ' + outcome.name} /></a>}<p className="text-xs text-muted-foreground">{report.status !== 'completed' || report.measurements.at(-1)?.integrity !== true || report.measurements.at(-1)?.timedOut ? 'This run or its execution evidence is incomplete. Treat these records as partial.' : 'Execution applies to the saved snapshot and tested inputs. A failure alone does not establish an implementation defect.'}</p></TabsContent>
        <TabsContent value="assessment" className="mt-5 space-y-4"><h4 className="font-medium">Agent decision summary</h4>{diagnosis ? <><p className="text-sm leading-relaxed">{diagnosis.reason}</p><p className="text-xs text-muted-foreground">Phase: {diagnosis.phase || 'execution'} · Model assessment, not an independent correctness label.</p>{diagnosis.evidence.map((citation, index) => <div key={index} className="border-l-2 border-border pl-4"><p className="mb-2 break-all font-mono text-xs text-muted-foreground">{citation.file}{citation.line ? ':' + citation.line : ''}</p><pre className="text-xs">{citation.quote}</pre></div>)}</> : <p className="text-sm text-muted-foreground">{report.replay ? 'Saved-suite replay did not refresh diagnoses. Inspect the original run for its historical assessments.' : 'No unique assessment matches this test and execution phase. Earlier diagnoses are available in the saved history below.'}</p>}</TabsContent>
      </Tabs>
    </CardContent>
  </Card>;
}
