import type { RepositorySnapshot } from "../lib/types";
import { Badge } from "./ui";

export function RepositoryVersion({
  repository,
}: {
  repository?: RepositorySnapshot | null;
}) {
  if (!repository) return null;
  const artifact = repository.artifact;
  return (
    <section className="panel">
      <h3>Code version used for verification</h3>
      {!artifact ? (
        <p>
          No saved code snapshot. This historical run cannot establish which
          file contents were executed.
        </p>
      ) : (
        <>
          <Badge>Saved code snapshot</Badge>
          <p>
            Snapshot <code>{artifact.id}</code> · {artifact.files.length} files
            · {artifact.files.reduce((total, file) => total + file.size, 0)}{" "}
            bytes
          </p>
          <p className="small muted">Content fingerprint</p>
          <code>{artifact.content_sha256}</code>
          <p className="small muted">
            Interfaces and test execution use the saved copy. Edits to the
            original directory do not affect this run. Each execution checks
            snapshot integrity before and after running. This fingerprint covers
            copied files and directories. Runtime versions are recorded
            separately for each execution attempt.
          </p>
          <details>
            <summary>Copied file manifest</summary>
            {artifact.files.map((file) => (
              <p key={file.path}>
                <code>{file.path}</code> · {file.size} bytes
                <br />
                <code>{file.sha256}</code>
              </p>
            ))}
          </details>
          {!!artifact.excluded.length && (
            <details>
              <summary>Excluded paths ({artifact.excluded.length})</summary>
              <ul>
                {artifact.excluded.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
