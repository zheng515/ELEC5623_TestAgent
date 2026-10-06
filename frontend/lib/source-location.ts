import type { SourceFragment } from "./types";

export function sourceLocation(fragment: SourceFragment): string {
  return fragment.locations?.length
    ? fragment.locations
        .map(
          (location) =>
            `${location.filename} · ${location.kind} ${location.number}`,
        )
        .join("; ")
    : `line ${fragment.line}`;
}
