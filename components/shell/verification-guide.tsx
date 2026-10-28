import { Card, CardContent } from "@/components/ui/card";

export function VerificationGuide() {
  return <Card className="gap-0 py-0"><CardContent className="px-5 py-4">
    <details>
      <summary className="cursor-pointer font-medium">Quick start</summary>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
        <li>Add a GitHub repository or ZIP. Set its branch or commit and project directory.</li>
        <li>Upload or paste requirements. Review extraction warnings and check project setup.</li>
        <li>Run verification. Open Evaluation to inspect results and export evidence.</li>
      </ol>
      <details className="mt-4 text-sm"><summary className="cursor-pointer">Support and limits</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Python / pytest and JavaScript or TypeScript / node:test. Jest, Vitest, nested Node suites and browser automation are unsupported.</li>
          <li>PDF, DOC, DOCX, TXT and Markdown: up to 10 MB, 12,000 requirement characters and 24 input items. Split larger specifications; text is never silently shortened.</li>
          <li>Scans use English OCR; review uncertain text. Word references identify paragraphs or converted body blocks, not pages. Complex layouts, headers and drawings may be missing.</li>
          <li>Advanced setup supports compatible Python wheels, locked npm dependencies and temporary PostgreSQL or Redis. Native builds and install scripts need a prepared image. Setup checks do not prove application startup readiness.</li>
        </ul>
      </details>
      <details className="mt-4 text-sm"><summary className="cursor-pointer">Results and next steps</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Passed applies to the tested inputs. Verified applies to mapped checks under the recorded policy. Neither proves correctness for every input.</li>
          <li>Failed: compare the requirement, assertion and diagnosis. Valid failing assertions remain visible.</li>
          <li>Blocked proposals are not executed. Review the reason before clarifying or regenerating.</li>
          <li>Re-run saved tests makes no model calls. Regenerate / clarify starts fresh analysis and may produce different tests.</li>
        </ul>
      </details>
    </details>
  </CardContent></Card>;
}
