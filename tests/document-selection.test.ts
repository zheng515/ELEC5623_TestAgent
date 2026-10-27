import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uncertainOcr } from '../lib/document-selection';
import { documentText, textRequirements, ruleSources } from '../lib/requirement-input';
import type { RequirementDocument } from '../lib/requirements';

function fixture(): RequirementDocument {
  return { id: 'document', fileName: 'SRS.pdf', sha256: 'original-hash', format: 'pdf', warnings: [], pages: [], segments: [
    { id: 'S1', text: 'R1: Return integer zero at the threshold.', location: 'Page 1, paragraph 1', page: 1, extraction: 'text' },
    { id: 'S2', text: 'R2: Reject invalid inputs.\nKeep the original multiline statement.', location: 'Page 2, paragraph 1', page: 2, extraction: 'ocr', confidence: 42 },
  ] };
}
test('upload text includes every extracted block and preserves multiline text and OCR provenance', () => {
  const document = fixture(), text = documentText(document), rules = textRequirements(text, document);
  assert.equal(text, document.segments.map(segment => segment.text).join('\n\n'));
  assert.equal(rules.length, 2);
  assert.deepEqual(rules.flatMap(rule => ruleSources(rule).map(source => source.segmentId)), ['S1', 'S2']);
  assert.equal(rules[1].source?.confidence, 42); assert.equal(rules[1].source?.page, 2);
  assert.equal(uncertainOcr(rules[1].source!), true);
});
test('35-block documents require no selection and retain all text and source locations', () => {
  const document = fixture(); document.segments = Array.from({ length: 35 }, (_, i) => ({ id: 'S' + i, text: 'Document paragraph ' + i, location: 'Paragraph ' + i }));
  const text = documentText(document), rules = textRequirements(text, document);
  assert.equal(rules.length, 35); assert.equal(rules.map(rule => rule.text).join('\n\n'), text);
  assert.deepEqual(rules.map(rule => rule.source?.segmentId), document.segments.map(segment => segment.id));
});
test('one multiline document paragraph stays intact and retains its citation', () => {
  const document = fixture(); document.segments = [document.segments[1]];
  const rules = textRequirements(documentText(document), document);
  assert.equal(rules.length, 1); assert.equal(rules[0].text, document.segments[0].text);
  assert.equal(rules[0].source?.segmentId, 'S2');
});
test('edited text loses its citation while unchanged paragraphs keep exact original links', () => {
  const document = fixture(), text = documentText(document).replace('Return integer zero', 'Return integer one');
  const rules = textRequirements(text, document);
  assert.equal(ruleSources(rules[0]).length, 0);
  assert.equal(ruleSources(rules[1])[0].quote, document.segments[1].text);
  assert.equal(ruleSources(rules[1])[0].sha256, document.sha256);
});
test('plain text is not limited by line count or length and is never truncated', () => {
  const lines = Array.from({ length: 35 }, (_, i) => 'Requirement ' + i);
  assert.deepEqual(textRequirements(lines.join('\n')).map(rule => rule.text), lines);
  assert.equal(textRequirements('A requirement.\nAnother requirement.').length, 2);
  assert.equal(textRequirements('x'.repeat(200000))[0].text.length, 200000);
  assert.throws(() => textRequirements(' \n '), /Enter requirements/);
});
test('Markdown heading-only paragraphs are section titles, not requirements', () => {
  const rules = textRequirements('# Shop requirements\n\n## 1. Login\n\n**FR1 — Role Selection**  \nCustomer Login is selected by default.\n\n### Notes\n\nPrices use two decimals.');
  assert.deepEqual(rules.map(rule => rule.text), ['**FR1 — Role Selection**  \nCustomer Login is selected by default.', 'Prices use two decimals.']);
  assert.deepEqual(rules.map(rule => rule.id), ['R1', 'R2']);
  assert.equal(textRequirements('# Only a heading')[0].text, '# Only a heading');
});
