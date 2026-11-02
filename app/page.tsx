import Link from "next/link";
import { ArrowDown, ArrowRight, Check, FileText, GitBranch, ScanLine, ShieldCheck, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeAuth } from "@/components/shell/home-auth";

const workflow = [
  { icon: FileText, title: "Bring the original requirement", text: "Import your requirements and a GitHub or ZIP project. Keep the source text beside the code it describes." },
  { icon: ScanLine, title: "Generate and review checks", text: "Break requirements into behaviours, identify gaps and review proposed assertions against the original contract." },
  { icon: Terminal, title: "Run against a saved snapshot", text: "Execute admitted tests in Docker. Record actual outcomes, source identity and the limits of each check." },
  { icon: GitBranch, title: "Follow the evidence", text: "Inspect a failure from requirement to test to execution. Investigate the implementation, test or requirement before changing it." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4">Skip to content</a>
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" aria-label="ReqTest home" className="text-2xl font-bold tracking-tight">REQTEST<span className="text-primary">.</span></Link>
          <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm">
            <a href="#workflow" className="hidden text-muted-foreground hover:text-foreground sm:inline">How it works</a>
            <a href="#example" className="hidden text-muted-foreground hover:text-foreground sm:inline">See an example</a>
            <HomeAuth />
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="relative isolate overflow-hidden border-b border-border/70">
          <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-40 -z-10 size-[650px] rounded-full bg-primary/10 blur-[100px]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
            <div>
              <p className="mb-6 flex items-center gap-2 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase"><span className="size-1.5 rounded-full bg-primary" />Requirement-aware verification</p>
              <h1 className="max-w-xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">Keep your tests tied to <span className="text-[#9ab3ff]">what was required.</span></h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">A passing test is only part of the story. ReqTest connects original requirements, generated tests and execution evidence so you can decide what to investigate next.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg"><Link href="/workspace">Start a verification<ArrowRight aria-hidden="true" /></Link></Button>
                <Button asChild size="lg" variant="outline"><a href="#example">Explore the example<ArrowDown aria-hidden="true" /></a></Button>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">For developers and QA engineers. Sign in to use the workspace.</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/20">
              <div className="flex items-center justify-between border-b border-border px-5 py-4 text-xs"><span className="flex items-center gap-2 text-muted-foreground"><GitBranch className="size-4" aria-hidden="true" />Contract to execution</span><span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">Illustrative trace</span></div>
              <div className="space-y-0 px-5 py-2 sm:px-6">
                <TraceStep number="01" label="Original requirement"><p>When the requested quantity equals stock, return integer zero.</p></TraceStep>
                <TraceStep number="02" label="Generated boundary check"><code className="break-words text-sm text-[#b6c8ff]">assert remaining(5, 5) == 0</code></TraceStep>
                <TraceStep number="03" label="Recorded execution"><p className="font-mono text-sm text-rose-300">ValueError: invalid stock or request</p></TraceStep>
              </div>
              <div className="border-t border-border bg-background/50 px-5 py-5 sm:px-6"><p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck aria-hidden="true" className="size-4 text-[#9ab3ff]" />Keep the failure. Inspect the contract.</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">A failure can be useful evidence. Compare the requirement, test and implementation before changing an assertion.</p></div>
            </div>
          </div>
        </section>

        <section id="workflow" aria-labelledby="workflow-title" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">From input to investigation</p>
          <h2 id="workflow-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">One workflow. Evidence you can follow.</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map(({ icon: Icon, title, text }, index) => <div key={title} className="border-t border-border pt-5"><div className="mb-5 flex items-center justify-between"><Icon aria-hidden="true" className="size-5 text-[#9ab3ff]" /><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span></div><h3 className="text-lg font-medium leading-snug">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}
          </div>
        </section>

        <section id="example" aria-labelledby="example-title" className="scroll-mt-8 border-y border-border/70 bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div><p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">A boundary worth investigating</p><h2 id="example-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">When code and existing tests agree on the wrong boundary.</h2><p className="mt-5 leading-relaxed text-muted-foreground">In our Inventory development case, an existing test expects an error when requested quantity equals stock. The supplied requirement says to return zero.</p><p className="mt-4 leading-relaxed text-muted-foreground">ReqTest retains a requirement-based failing check and links it to the conflicting implementation. The developer can inspect the evidence and decide what needs to change.</p><p className="mt-5 text-xs leading-relaxed text-muted-foreground">Observed on a synthetic development fixture. This example demonstrates traceability, rather than independently measured diagnosis accuracy or debugging speed.</p></div>
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="border-b border-border px-5 py-4 text-sm font-medium">Inventory case<span className="ml-3 text-xs font-normal text-muted-foreground">Saved observations</span></div>
              <dl className="divide-y divide-border">
                <CaseRow title="Requirement" detail="requested ≤ stock returns stock − requested, including zero at equality." />
                <CaseRow title="Implementation" detail="requested >= stock raises ValueError, rejecting the equality case." />
                <CaseRow title="Existing tests" detail="Both pass, including a test that expects the equality error." />
                <CaseRow title="Generated check" detail="The equality assertion fails on the original and passes on a separate corrected copy." />
                <CaseRow title="Next step" detail="Preserve the assertion. Confirm the contract and investigate the implementation." />
              </dl>
              <p className="border-t border-border px-5 py-4 text-xs leading-relaxed text-muted-foreground">The corrected copy was an evaluation reference. ReqTest does not patch your imported implementation.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="scope-title" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-20">
            <div><h2 id="scope-title" className="text-3xl font-semibold tracking-tight">Built for focused checks.</h2><p className="mt-4 leading-relaxed text-muted-foreground">Use an explicit requirement and a supported project to investigate a defined behaviour. Passing checks describe tested cases, not proof that an entire system is correct.</p><ul className="mt-6 space-y-4 text-sm">{["Python / pytest and Node.js / node:test projects", "PDF, Word or text requirements; GitHub or ZIP sources", "Downloadable tests, linked evidence and saved-suite replay"].map(text => <li key={text} className="flex gap-3"><Check aria-hidden="true" className="size-4 shrink-0 text-[#9ab3ff]" /><span>{text}</span></li>)}</ul></div>
            <div className="space-y-6 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"><div><h3 className="font-medium">Know where your data goes</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Selected requirement and repository context is sent to the configured external model provider. Use material you are authorised to share and remove secrets before importing.</p></div><div><h3 className="font-medium">Execution and judgment stay distinct</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Tests run in constrained Docker environments against a saved source snapshot. Model assessments can be wrong; developers retain responsibility for clarification, source changes and release decisions.</p></div><div><h3 className="font-medium">Choose the verification depth</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Start with requirement checks or add optional mutation checks. Missing or limited evidence remains visible. Saved-suite replay repeats execution without new model calls.</p></div></div>
          </div>
          <div className="mt-16 flex flex-col items-start justify-between gap-6 border-t border-border pt-10 sm:flex-row sm:items-center"><div><h2 className="text-2xl font-semibold tracking-tight">Bring a requirement. Follow the evidence.</h2><p className="mt-2 text-sm text-muted-foreground">Start with one behaviour you need to understand.</p></div><Button asChild size="lg"><Link href="/workspace">Open workspace<ArrowRight aria-hidden="true" /></Link></Button></div>
        </section>
      </main>
      <footer className="border-t border-border/70"><div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8"><span>REQTEST · Requirement-aware verification</span><span>Inspect the evidence. Make the decision.</span></div></footer>
    </div>
  );
}

function TraceStep({ number, label, children }: { number: string; label: string; children: React.ReactNode }) {
  return <div className="flex gap-4 border-b border-border/60 py-5 last:border-0"><span className="mt-0.5 font-mono text-xs text-muted-foreground">{number}</span><div className="min-w-0"><p className="mb-2 text-xs text-muted-foreground">{label}</p><div className="text-sm leading-relaxed">{children}</div></div></div>;
}

function CaseRow({ title, detail }: { title: string; detail: string }) {
  return <div className="grid gap-2 px-5 py-4 sm:grid-cols-[120px_1fr] sm:gap-4"><dt className="text-sm font-medium">{title}</dt><dd className="text-sm leading-relaxed text-muted-foreground">{detail}</dd></div>;
}
