import { createHash } from 'node:crypto';
import { posix } from 'node:path';

// A mapped file alone is insufficient when a recorded local dependency remains unseen.
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

// Static local-import candidates only. No code is evaluated and no external module is fetched.
// Dynamic imports, aliases and runtime configuration can still require uninspected files.
export function localDependencyGraph(files: Record<string, string>) {
  const graph = new Map<string, string[]>();
  const has = (file: string) => Object.hasOwn(files, file);
  for (const [file, text] of Object.entries(files)) {
    const dependencies = new Set<string>();
    function resolve(base: string, python: boolean) {
      base = posix.normalize(base);
      if (base === '..' || base.startsWith('../') || posix.isAbsolute(base)) return;
      const candidates = python ? [base + '.py', posix.join(base, '__init__.py')] : [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'].map(ext => base + ext), ...['.ts', '.tsx', '.js', '.mjs', '.cjs'].map(ext => posix.join(base, 'index' + ext))];
      // NodeNext TypeScript sources commonly import the emitted .js filename.
      if (!python && /\.[cm]?js$/.test(base)) candidates.push(base.replace(/\.([cm]?)js$/, '.$1ts'), base.replace(/\.js$/, '.tsx'));
      const found = candidates.find(has);
      if (!found) return;
      dependencies.add(found);
      if (python) for (let directory = posix.dirname(found); directory !== '.'; directory = posix.dirname(directory)) {
        const init = posix.join(directory, '__init__.py');
        if (has(init)) dependencies.add(init);
      }
    }
    if (file.endsWith('.py')) {
      const roots = [''];
      for (let directory = posix.dirname(file); directory !== '.'; directory = posix.dirname(directory)) roots.push(directory);
      for (const match of text.matchAll(/^\s*from\s+([.\w]+)\s+import\s+(\([^)]*\)|[^\n;]+)/gm)) {
        const specifier = match[1], dots = /^\.+/.exec(specifier)?.[0].length || 0;
        const bases = dots ? [posix.join(posix.dirname(file), ...Array(dots - 1).fill('..'), specifier.slice(dots).replaceAll('.', '/'))] : roots.map(root => posix.join(root, specifier.replaceAll('.', '/')));
        for (const base of bases) {
          resolve(base, true);
          for (const name of match[2].replace(/[()]/g, '').split(',')) {
            const child = /^\s*(\w+)/.exec(name)?.[1];
            if (child) resolve(posix.join(base, child), true);
          }
        }
      }
      for (const match of text.matchAll(/^\s*import\s+([^\n;]+)/gm)) for (const name of match[1].split(',')) {
        const specifier = /^\s*([\w.]+)/.exec(name)?.[1];
        if (specifier) for (const root of roots) resolve(posix.join(root, specifier.replaceAll('.', '/')), true);
      }
    } else if (/\.[cm]?[jt]sx?$/.test(file)) {
      const specs = [...text.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g), ...text.matchAll(/\b(?:require|import)\s*\(\s*["']([^"']+)["']\s*\)/g)];
      for (const match of specs) if (match[1].startsWith('.')) resolve(posix.join(posix.dirname(file), match[1]), false);
    }
    graph.set(file, [...dependencies].filter(dependency => dependency !== file).sort());
  }
  return graph;
}

// Keep whole original files: citation line numbers must never shift after retrieval.
export function selectProjectContext(files: Record<string, string>, query: string, required: string[] = [], budget = 180_000, focused = false) {
  const entries = Object.entries(files), bytes = (text: string) => Buffer.byteLength(JSON.stringify(text));
  const totalBytes = entries.reduce((sum, [file, text]) => sum + bytes(file) + bytes(text), 0);
  const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9_]+/).filter(term => term.length > 2))];
  const ranked = entries.map(([file, text]) => {
    const path = file.toLowerCase(), content = text.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (path.includes(term) ? 8 : 0) + (content.includes(term) ? 1 : 0), 0);
    return { file, text, size: bytes(file) + bytes(text), score, required: required.includes(file) };
  }).sort((a, b) => Number(b.required) - Number(a.required) || b.score - a.score || a.file.localeCompare(b.file));
  const graph = localDependencyGraph(files), byFile = new Map(ranked.map(item => [item.file, item]));
  const selected: Record<string, string> = {};
  let selectedBytes = 0;
  function include(file: string) {
    if (Object.hasOwn(selected, file)) return true;
    const item = byFile.get(file);
    if (!item || selectedBytes + item.size > budget) return false;
    selected[file] = item.text; selectedBytes += item.size; return true;
  }
  // Reserve explicitly mapped files before allowing their dependencies to consume the budget.
  for (const item of ranked.filter(item => item.required)) include(item.file);
  const dependencyLinks = new Map<string, { from: string; to: string }>(), expanded = new Set<string>();
  function expand(file: string) {
    if (expanded.has(file)) return;
    expanded.add(file);
    for (const to of graph.get(file) || []) {
      dependencyLinks.set(JSON.stringify([file, to]), { from: file, to });
      if (include(to)) expand(to);
    }
  }
  if (!focused && totalBytes <= budget) for (const [file] of entries) include(file);
  else for (const item of ranked) if (focused ? item.required : item.required || item.score > 0 || selectedBytes === 0) {
    if (include(item.file)) expand(item.file);
  }
  const omitted = ranked.filter(item => !Object.hasOwn(selected, item.file)).map(item => ({ file: item.file, bytes: item.size, sha256: createHash('sha256').update(item.text).digest('hex'), required: item.required }));
  return { files: !focused && totalBytes <= budget ? files : selected, scope: { totalBytes, selectedBytes, budget, selectedFiles: Object.keys(selected), omitted, complete: omitted.length === 0, dependencyLinks: [...dependencyLinks.values()] } };
}
