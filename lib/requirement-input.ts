import type { RequirementDocument, RequirementSource } from './requirements';

export const documentText = (document: RequirementDocument) => document.segments.map(segment => segment.text).join('\n\n');
type Span = { start: number; end: number };
type Rule = { id: string; text: string; originalId?: string; source?: RequirementSource; sources?: RequirementSource[] };

export function parseRequirementInput(input: string, document?: RequirementDocument) {
  const text = input.trim();
  if (!text) throw new Error('Enter requirements or upload a requirement file.');
  // Explicit identifiers establish input boundaries, not semantic correctness.
  const events = [...text.matchAll(/^[ \t]*(?:(?:#{1,6}[ \t]+)?(?:\|[ \t]*)?(?:\*\*)?((?:N?FR(?:-[A-Z0-9]+)*[- ]?\d+|R\d+))(?:\*\*)?(?=\s*[:.)|\-]|[ \t]+|$)|#{1,6}[ \t]+[^\r\n]+)/gmi)];
  const identified = events.some(event => event[1]);
  const groups: { originalId?: string; spans: Span[] }[] = [];
  const context: string[] = [];
  const span = (start: number, end: number) => {
    const content = text.slice(start, end), left = content.length - content.trimStart().length;
    return { start: start + left, end: end - (content.length - content.trimEnd().length) };
  };
  if (identified) {
    let cursor = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i], start = event.index!;
      if (start > cursor) context.push(text.slice(cursor, start));
      const end = events[i + 1]?.index ?? text.length;
      if (event[1]) {
        const originalId = event[1].toUpperCase();
        let group = groups.find(group => group.originalId === originalId);
        if (!group) { group = { originalId, spans: [] }; groups.push(group); }
        group.spans.push(span(start, end));
      } else context.push(text.slice(start, end));
      cursor = end;
    }
  } else {
    let sections = text.split(/\n\s*\n/).filter(section => section.trim());
    if (sections.length === 1 && !document) sections = text.split(/\r?\n/).filter(section => section.trim());
    // Markdown headings name a section; they state no requirement of their own.
    const heading = (section: string) => section.trim().split(/\r?\n/).every(line => /^\s*#{1,6}\s/.test(line));
    const statements = sections.some(section => !heading(section));
    let cursor = 0;
    for (const section of sections) {
      const start = text.indexOf(section, cursor); cursor = start + section.length;
      if (statements && heading(section)) context.push(section);
      else groups.push({ spans: [span(start, cursor)] });
    }
  }
  const rules: Rule[] = groups.map((group, index) => {
    const content = group.spans.map(range => text.slice(range.start, range.end)).join('\n\n');
    const sources: RequirementSource[] = [];
    for (const segment of document?.segments || []) {
      const padded = '\n\n' + text + '\n\n', needle = '\n\n' + segment.text + '\n\n';
      const start = padded.indexOf(needle);
      // Edited or repeated source blocks have no unique exact location.
      if (!segment.text.trim() || start < 0 || padded.indexOf(needle, start + 1) >= 0) continue;
      for (const range of group.spans) {
        const overlap = span(Math.max(start, range.start), Math.min(start + segment.text.length, range.end));
        if (overlap.end <= overlap.start) continue;
        const quote = text.slice(overlap.start, overlap.end);
        sources.push({ documentId: document!.id, segmentId: segment.id, fileName: document!.fileName, sha256: document!.sha256,
          location: segment.location, page: segment.page, paragraph: segment.paragraph, line: segment.line,
          extraction: segment.extraction, confidence: segment.confidence, quote, start: overlap.start - start });
      }
    }
    const source = sources.length === 1 && sources[0].quote === content ? sources[0] : undefined;
    return { id: 'R' + (index + 1), text: content, ...(group.originalId ? { originalId: group.originalId } : {}), ...(source ? { source } : sources.length ? { sources } : {}) };
  });
  return { rules, mode: identified ? 'numbered' as const : 'text' as const, text, context: context.join('\n\n').trim() };
}

export const textRequirements = (input: string, document?: RequirementDocument) => parseRequirementInput(input, document).rules;
export const ruleSources = (rule: { source?: RequirementSource; sources?: RequirementSource[] }) => rule.sources || (rule.source ? [rule.source] : []);
export function sourceMatches(rule: Rule, source: RequirementSource, document: RequirementDocument) {
  const segment = document.segments.find(segment => segment.id === source.segmentId);
  const quote = source.quote || rule.text, start = source.start || 0;
  return source.documentId === document.id && source.sha256 === document.sha256 && !!quote && start >= 0 &&
    segment?.text.slice(start, start + quote.length) === quote && rule.text.includes(quote);
}
