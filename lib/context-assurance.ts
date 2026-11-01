// A mapped file alone is insufficient when a recorded local dependency remains unseen.
// This policy helper is dependency-free so saved evidence can be evaluated in the browser and server.
export function hasUninspectedContext(selections: { selectedFiles: string[]; complete: boolean; dependencyLinks?: { from: string; to: string }[] }[] | undefined, mapped: string[]) {
  if (!selections?.some(selection => !selection.complete)) return false;
  if (!mapped.length) return true;
  const inspected = new Set(selections.flatMap(selection => selection.selectedFiles));
  const links = selections.flatMap(selection => selection.dependencyLinks || []);
  const pending = [...mapped], visited = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (!inspected.has(file)) return true;
    pending.push(...links.filter(link => link.from === file).map(link => link.to));
  }
  return false;
}
