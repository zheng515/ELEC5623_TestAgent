import type { RequirementDocument, RequirementSource } from './requirements';

export const documentText = (document: RequirementDocument) => document.segments.map(segment => segment.text).join('\n\n');

// Long documents stay intact as context for behavior decomposition, never line-selected.
export function textRequirements(input: string, document?: RequirementDocument) {
  const text = input.trim();
  if (!text) throw new Error('Enter requirements or upload a requirement file.');
  let sections = text.split(/\n\s*\n/).filter(section => section.trim());
  if (sections.length === 1 && !document) sections = text.split(/\r?\n/).filter(section => section.trim());
  const rules: { id: string; text: string; source?: RequirementSource; sources?: RequirementSource[] }[] = [];
  for (const content of sections) {
    const sources = document?.segments.filter(segment => segment.text.trim() && ('\n\n' + content + '\n\n').includes('\n\n' + segment.text + '\n\n')).map(segment => ({
      documentId: document.id, segmentId: segment.id, fileName: document.fileName, sha256: document.sha256,
      location: segment.location, page: segment.page, paragraph: segment.paragraph, line: segment.line,
      extraction: segment.extraction, confidence: segment.confidence, quote: segment.text,
    }));
    const source = sources?.length === 1 && sources[0].quote === content ? sources[0] : undefined;
    rules.push({ id: 'R' + (rules.length + 1), text: content, ...(source ? { source } : sources?.length ? { sources } : {}) });
  }
  return rules;
}

export const ruleSources = (rule: { source?: RequirementSource; sources?: RequirementSource[] }) => rule.sources || (rule.source ? [rule.source] : []);
