export function VerificationGuide({ firstRun }: { firstRun: boolean }) {
  return <details open={firstRun} className="border rounded-xl p-5 space-y-3">
    <summary className="cursor-pointer font-semibold">Quick start</summary>
    <ol className="list-decimal pl-5 space-y-2 text-sm">
      <li>Add a GitHub repository or project ZIP. Choose the branch or commit separately; select a project directory for a larger repository.</li>
      <li>Upload the requirement document or paste its text. Uploaded text fills Requirements automatically. Review extraction warnings, then check project setup and run verification.</li>
      <li>Open Evaluation for passed and failed tests, unresolved requirements and Agent decisions. Follow a requirement to its test and recorded outcome, then export the evidence.</li>
    </ol>
    <details className="text-sm"><summary className="cursor-pointer">Supported projects and documents</summary>
      <ul className="list-disc pl-5 mt-3 space-y-2 text-muted-foreground">
        <li>Focused Python / pytest and JavaScript or TypeScript / node:test projects. Jest, Vitest, nested Node test suites and browser automation are outside the current scope.</li>
        <li>PDF, DOC, DOCX, TXT and Markdown files up to 10 MB. Requirements support 12,000 characters and 24 input items. Larger specifications must be split; text is not silently shortened.</li>
        <li>Scanned PDFs use English OCR. Check uncertain text against the original. Word references identify paragraphs or converted body blocks, not Word page numbers; complex layouts, headers and drawings are not fully extracted.</li>
        <li>Advanced settings can install compatible Python wheels or locked npm dependencies and start temporary PostgreSQL or Redis services. Native builds and install scripts need a prepared image. Setup checks do not prove application startup readiness.</li>
      </ul>
    </details>
    <details className="text-sm"><summary className="cursor-pointer">Understand the result and choose a next step</summary>
      <ul className="list-disc pl-5 mt-3 space-y-2 text-muted-foreground">
        <li>Passed: a recorded test passed for its inputs. Verified: the mapped checks support a stated behavior under the recorded verification policy. Neither establishes correctness for every possible input.</li>
        <li>Failed: compare the original requirement, assertion and diagnosis. A valid failing assertion is kept so a suspected implementation defect remains visible.</li>
        <li>Blocked: the proposal has no admission approval and is not executed. Inspect its review reason before clarifying requirements or regenerating.</li>
        <li>Re-run saved tests repeats the same checks without model calls. Regenerate / clarify starts fresh analysis and may generate different tests.</li>
      </ul>
    </details>
  </details>;
}
