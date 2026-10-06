import type { VerificationReport } from "../lib/types";
import { Badge } from "./ui";

export function SourceAudit({ report }: { report?: VerificationReport }) {
  if (!report) return null;
  const audit = report.source_audit;
  return (
    <section className="panel">
      <h3>Specification analysis scope</h3>
      <p className="small muted">
        Validated requirement links measure extracted testable requirements
        only. They do not measure verification of the entire specification.
      </p>
      {!audit ? (
        <p>No source audit recorded. Specification completeness is unknown.</p>
      ) : (
        <>
          <Badge tone="amber">Completeness not established</Badge>
          <p>
            {audit.retained_requirements} requirements retained. Extraction
            limit: {audit.extraction_limit}.
            {audit.limit_reached &&
              " Limit reached; additional rules may have been omitted."}
          </p>
          <p>
            {audit.unlinked_fragments.length} source fragments without an
            unambiguous quote link. These may be rules or context. Even fully
            linked text can contain rules that were not extracted.
          </p>
          {audit.ambiguous_requirement_ids.length > 0 && (
            <p>
              Repeated quotes with ambiguous locations:{" "}
              {audit.ambiguous_requirement_ids.join(", ")}
            </p>
          )}
          {audit.unlinked_fragments.map((fragment) => (
            <details key={fragment.start}>
              <summary>Unlinked source · line {fragment.line}</summary>
              <pre className="requirement-source">{fragment.text}</pre>
            </details>
          ))}
          <details>
            <summary>Recorded source quote links</summary>
            {audit.links.map((link) => (
              <div key={`${link.start}-${link.end}`}>
                <p>
                  {link.requirement_ids.join(", ")} · line {link.line}
                </p>
                <pre className="requirement-source">{link.text}</pre>
              </div>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
