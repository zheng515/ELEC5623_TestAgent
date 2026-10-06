import type { ExecutionEnvironment } from "../lib/types";

export function RuntimeEnvironment({
  environment,
  error,
}: {
  environment?: ExecutionEnvironment | null;
  error?: string | null;
}) {
  if (!environment)
    return (
      <p className="small muted">
        {error ||
          "No execution environment recorded. Runtime versions are unknown for this attempt."}
      </p>
    );
  return (
    <details>
      <summary>Pinned execution environment</summary>
      <p>
        Requested image: <code>{environment.requested_image}</code>
      </p>
      <p>
        Executed image ID: <code>{environment.image_id}</code>
      </p>
      <p>
        Environment fingerprint: <code>{environment.fingerprint}</code>
      </p>
      <p>
        Python: <code>{environment.python_version}</code>
      </p>
      <p>
        Image platform: {environment.image_os} /{" "}
        {environment.image_architecture}
      </p>
      <p>Runtime platform: {environment.platform}</p>
      <p className="small muted">
        Initial execution and repair use the same local image ID. Versions below
        are installed distributions inspected in that image; they do not prove
        that every project dependency is available.
      </p>
      <table>
        <thead>
          <tr>
            <th>Installed package</th>
            <th>Version</th>
          </tr>
        </thead>
        <tbody>
          {environment.packages.map((item, index) => (
            <tr key={`${item.name}-${index}`}>
              <td>{item.name}</td>
              <td>{item.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p>{error}</p>}
    </details>
  );
}
