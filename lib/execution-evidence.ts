import type { Measurement } from './python-types';

/** Exact original log lines behind bounded provider references; no quote normalization. */
export function executionEvidence(measurement: Measurement, budget = 60_000, maxLines = 300) {
  const outcomes = [...measurement.outcomes].sort((a, b) => Number(b.file.startsWith('reqtest_generated/')) - Number(a.file.startsWith('reqtest_generated/')));
  const blocks = [...outcomes.map(outcome => ({ location: outcome.node, text: outcome.message })), { location: 'execution log', text: measurement.log }];
  const unique = new Map<string, string>();
  for (const block of blocks) for (const line of block.text.split('\n')) if (line.trim() && !unique.has(line)) unique.set(line, block.location);
  const references: { id: string; quote: string; location: string }[] = [];
  let bytes = 0;
  for (const [quote, location] of unique) {
    const item = { id: `E${references.length + 1}`, quote, location };
    const size = Buffer.byteLength(JSON.stringify(item));
    if (bytes + size > budget || references.length >= maxLines) continue;
    references.push(item); bytes += size;
  }
  return { references, scope: { totalUniqueLines: unique.size, selectedLines: references.length, omittedLines: unique.size - references.length, selectedBytes: bytes, budget, complete: references.length === unique.size } };
}
