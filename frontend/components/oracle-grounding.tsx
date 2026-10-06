import type { OracleGrounding } from "../lib/types";
import { Badge } from "./ui";

export function OracleGroundingDetails({
  grounding,
}: {
  grounding?: OracleGrounding | null;
}) {
  if (!grounding)
    return <p>No independent oracle review recorded. Start a new run.</p>;
  return (
    <div>
      <Badge tone={grounding.status === "supported" ? "teal" : "amber"}>
        {grounding.status === "supported"
          ? "Source support assessed by AI"
          : "Oracle needs review"}
      </Badge>
      <p>{grounding.rationale}</p>
      {grounding.citations.map((citation, index) => (
        <blockquote key={index}>
          <code>{citation.requirement_id}</code>: {citation.quote}
        </blockquote>
      ))}
      {!!grounding.issues.length && (
        <ul>
          {grounding.issues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      )}
      <p className="small muted">
        The server checks exact source citations and binds this assessment to
        the saved scenario. AI assessment does not prove semantic correctness or
        test adequacy.
      </p>
    </div>
  );
}
