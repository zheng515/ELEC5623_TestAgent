"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Textarea } from "@/components/ui/textarea";
import { goldSchema, reviewSchema, reviewTemplate, validateReview, scoreReports, type Gold, type Review } from "@/lib/evaluation";
import type { PythonReport } from "@/lib/python-types";

export function EvaluationWorkspace() {
  const [report, setReport] = useState<PythonReport>();
  const [gold, setGold] = useState<Gold>();
  const [review, setReview] = useState<Review>();
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState("");
  async function load(file: File | undefined, kind: "report" | "gold" | "review") {
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error("Use a JSON file smaller than 4 MB.");
      const data = JSON.parse(await file.text());
      setMetrics(""); setMessage("");
      if (kind === "gold") {
        const next = goldSchema.parse(data); setGold(next); setReference(JSON.stringify(next, null, 2));
        setReview(report ? reviewTemplate(report, next) : undefined);
      } else if (kind === "review") setReview(reviewSchema.parse(data));
      else {
        if (!["B0", "B1", "B2", "B3"].includes(data.variant) || !Array.isArray(data.measurements) || !Array.isArray(data.tests) || !Array.isArray(data.rules)) throw new Error("Upload a Python benchmark report.json.");
        if (gold) { const template = reviewTemplate(data, gold); setReview(template); }
        setReport(data);
      }
    } catch { setMessage("Cannot load this file. Check its type and schema. Loading a new report or reference resets the output review."); }
  }
  function download(name: string, data: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  }
  function saveReference() {
    try { const next = goldSchema.parse(JSON.parse(reference)); if (next.reviewed && !next.reviewer.trim()) throw new Error(); setGold(next); setReview(report ? reviewTemplate(report, next) : undefined); setMetrics(""); download("reference.gold.json", next); setMessage("Reference saved. Output review was reset because its labels may have changed."); }
    catch { setMessage("Reference must have valid unique IDs and a named reviewer when marked reviewed."); }
  }
  function finish() {
    try {
      if (!report || !gold || !review || !gold.reviewed) throw new Error("Review the reference labels independently first.");
      const next = reviewSchema.parse({ ...review, reviewed: true });
      validateReview(report, gold, next); setReview(next);
      setMetrics(JSON.stringify(scoreReports([{ report, gold, review: next }]), null, 2));
      download("review.json", next); setMessage("Review validated and downloaded. Replace this run's review.json, then run the aggregate score command.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Complete every review field."); }
  }
  const choice = (value: boolean | null, onChange: (value: boolean | null) => void) => <select className="border rounded p-2 bg-background" value={value === null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Pending</option><option value="true">Yes</option><option value="false">No</option></select>;
  function edit(next: Review) { setReview({ ...next, reviewed: false }); setMetrics(""); }
  return <section className="space-y-6">
    <h1 className="text-3xl font-bold">Independent evaluation</h1>
    <p>Review a benchmark run against independently checked reference labels. Nothing here is sent to a model or saved on the server. Downloads must be copied back to the matching benchmark directory.</p>
    <div className="grid md:grid-cols-3 gap-4">{(["report", "gold", "review"] as const).map(kind => <label key={kind}>{kind === "gold" ? "Reference labels (.gold.json)" : kind === "report" ? "Run evidence (report.json)" : "Resume review (optional)"}<FileInput accept=".json" onChange={event => load(event.target.files?.[0], kind)} /></label>)}</div>
    {gold && <details><summary>Reference review</summary><p>Check labels against the original project and requirements, independently of the agent. Set reviewed and reviewer only after that work. Saving resets the output annotations.</p><Textarea rows={12} value={reference} onChange={event => setReference(event.target.value)} /><Button onClick={saveReference}>Validate and download reference</Button></details>}
    {report && <details><summary>Run evidence: {report.title} / {report.variant}</summary><p>Original requirements, source citations, test code, logs and before/after measurements:</p><pre className="text-xs whitespace-pre-wrap max-h-96 overflow-auto">{JSON.stringify(report, null, 2)}</pre></details>}
    {report && gold && review && <div className="space-y-5">
      <label>Output reviewer<Input value={review.reviewer} onChange={event => edit({ ...review, reviewer: event.target.value })} /></label>
      <label className="flex gap-3 items-center">Does this run provide a usable, evidence-supported outcome?{choice(review.validOutcome, validOutcome => edit({ ...review, validOutcome }))}</label>
      {(["issues", "gaps", "inconsistencies"] as const).map(key => <details key={key}><summary>{key} ({review[key].length})</summary>{review[key].map((item, index) => <div className="border p-3 space-y-2" key={item.id}><p>Finding {item.id}</p><label>Matching reference<select className="border rounded p-2 bg-background" value={item.match || ""} onChange={event => edit({ ...review, [key]: review[key].map((other, i) => i === index ? { ...other, match: event.target.value || null } : other) })}><option value="">No match / false positive</option>{(key === "gaps" ? gold.behaviors.filter(item => item.initialGap) : gold[key]).map(label => <option key={label.id} value={label.id}>{label.id}: {label.description}</option>)}</select></label><label className="flex gap-3">Supported by the evidence?{choice(item.evidenceSupported, evidenceSupported => edit({ ...review, [key]: review[key].map((other, i) => i === index ? { ...other, evidenceSupported } : other) }))}</label></div>)}</details>)}
      <details><summary>Behavior coverage ({review.coverage.length})</summary><p>Select only executed tests whose assertions actually check the reference behavior. Empty selections mean uncovered.</p>{review.coverage.map((item, index) => <div key={item.id} className="border p-3"><p>{item.id}: {gold.behaviors.find(label => label.id === item.id)?.description}</p>{(["beforeNodes", "afterNodes"] as const).map(key => <label className="block" key={key}>{key === "beforeNodes" ? "Initial execution" : "Final execution"}<select multiple className="block w-full border bg-background p-2" value={item[key]} onChange={event => edit({ ...review, coverage: review.coverage.map((other, i) => i === index ? { ...other, [key]: [...event.target.selectedOptions].map(option => option.value) } : other) })}>{(key === "beforeNodes" ? report.measurements[0] : report.measurements.at(-1))?.outcomes.map(outcome => <option key={outcome.node} value={outcome.node}>{outcome.node} ({outcome.status})</option>)}</select></label>)}</div>)}</details>
      <details><summary>Failure diagnoses ({review.diagnoses.length})</summary>{review.diagnoses.map((item, index) => <div key={(item.phase || "execution") + ":" + item.testId} className="border p-3 space-y-2"><p>{item.phase || "execution"} / {item.testId}</p><select className="border bg-background p-2" value={item.expected || ""} onChange={event => edit({ ...review, diagnoses: review.diagnoses.map((other, i) => i === index ? { ...other, expected: event.target.value as typeof item.expected || null } : other) })}><option value="">Pending classification</option>{["generated_test_error", "requirement_ambiguity", "potential_implementation_defect", "environment_failure", "uncertain"].map(value => <option key={value}>{value}</option>)}</select><label className="flex gap-3">Agent diagnosis supported by evidence?{choice(item.evidenceSupported, evidenceSupported => edit({ ...review, diagnoses: review.diagnoses.map((other, i) => i === index ? { ...other, evidenceSupported } : other) }))}</label></div>)}</details>
      <details><summary>Mutation relevance ({review.mutants.length})</summary>{review.mutants.map((item, index) => <div key={item.attempt + ":" + item.id} className="border p-3"><p>Attempt {item.attempt + 1} / {item.id}</p><pre className="text-xs whitespace-pre-wrap">{report.mutations[item.attempt]?.mutants.find(mutant => mutant.id === item.id)?.diff}</pre>{(["relevant", "equivalent"] as const).map(key => <label key={key} className="flex gap-3">{key}{choice(item[key], value => edit({ ...review, mutants: review.mutants.map((other, i) => i === index ? { ...other, [key]: value } : other) }))}</label>)}</div>)}</details>
      <div className="flex gap-3"><Button onClick={finish}>Validate and download completed review</Button><Button variant="outline" onClick={() => download("review.json", review)}>Download draft</Button></div>
    </div>}
    {message && <p role="status">{message}</p>}
    {metrics && <details open><summary>Single-run metrics (not an aggregate comparison)</summary><pre className="text-xs whitespace-pre-wrap">{metrics}</pre></details>}
  </section>;
}
