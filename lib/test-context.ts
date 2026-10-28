import type { Measurement } from './python-types';

/** Select a bounded model catalog; this never selects or truncates execution. */
export function selectTestContext(nodes: string[], query: string, maxNodes = 200, byteBudget = 24_000) {
  const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2))];
  const groups = new Map<string, { node: string; score: number }[]>();
  for (const node of nodes) {
    const score = terms.reduce((sum, term) => sum + (node.toLowerCase().includes(term) ? 1 : 0), 0);
    const file = node.split('::')[0];
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file)!.push({ node, score });
  }
  const ranked = [...groups.values()].map(group => group.sort((a, b) => b.score - a.score || a.node.localeCompare(b.node))).sort((a, b) => b[0].score - a[0].score || a[0].node.localeCompare(b[0].node));
  const selected: string[] = [];
  let bytes = 0;
  // Round-robin across files avoids one heavily parameterized module consuming everything.
  for (let index = 0; selected.length < maxNodes && ranked.some(group => group[index]); index++) {
    for (const group of ranked) {
      const item = group[index];
      if (!item) continue;
      const size = Buffer.byteLength(JSON.stringify(item.node));
      if (bytes + size > byteBudget || selected.length >= maxNodes) continue;
      selected.push(item.node); bytes += size;
    }
  }
  return { nodes: selected, scope: { totalNodes: nodes.length, selectedNodes: selected.length, omittedNodes: nodes.length - selected.length, byteBudget, selectedBytes: bytes, purpose: 'Model context only. The execution baseline uses the full collected suite.' } };
}

export function measurementContext(measurement: Measurement | undefined, relevant: string[] = []) {
  if (!measurement) return undefined;
  const wanted = new Set(relevant);
  const candidates = measurement.outcomes.filter(item => ['failed', 'error'].includes(item.status) || wanted.has(item.node) || item.file.startsWith('reqtest_generated/'));
  const selected = candidates.sort((a, b) => Number(['failed', 'error'].includes(b.status)) - Number(['failed', 'error'].includes(a.status)) || Number(b.file.startsWith('reqtest_generated/')) - Number(a.file.startsWith('reqtest_generated/'))).slice(0, 200);
  return { ...measurement, outcomes: selected,
    outcomeScope: { total: measurement.outcomes.length, included: selected.length, omitted: measurement.outcomes.length - selected.length,
      counts: Object.fromEntries(['passed', 'failed', 'error', 'skipped'].map(status => [status, measurement.outcomes.filter(item => item.status === status).length])),
      complete: selected.length === measurement.outcomes.length, note: 'Only listed outcomes are shown to the model. Full exact outcomes remain in the saved measurement.' } };
}
