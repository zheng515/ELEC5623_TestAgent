import type { DocumentLocation, SourceFragment } from "./types";

export function documentLocation(location: DocumentLocation): string {
  const label =
    location.method === "converted" ? "converted paragraph" : location.kind;
  const method =
    location.method === "ocr"
      ? ` · OCR${location.confidence != null ? ` (score ${location.confidence}/100)` : ""}`
      : "";
  return `${label} ${location.number}${method}`;
}

export function sourceLocation(fragment: SourceFragment): string {
  return fragment.locations?.length
    ? fragment.locations
        .map(
          (location) => `${location.filename} · ${documentLocation(location)}`,
        )
        .join("; ")
    : `line ${fragment.line}`;
}
