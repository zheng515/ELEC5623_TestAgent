import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uncertainOcr } from '../lib/document-selection';
import { documentText, textRequirements, ruleSources, parseRequirementInput, sourceMatches } from '../lib/requirement-input';
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
test('without requirement identifiers, Markdown heading-only paragraphs become context, not requirements', () => {
  const input = parseRequirementInput('# Shop requirements\n\n## 1. Login\n\nCustomer Login is selected by default.\n\n### Notes\n\nPrices use two decimals.');
  assert.equal(input.mode, 'text');
  assert.deepEqual(input.rules.map(rule => rule.text), ['Customer Login is selected by default.', 'Prices use two decimals.']);
  assert.deepEqual(input.rules.map(rule => rule.id), ['R1', 'R2']);
  assert.ok(input.context.includes('## 1. Login'));
  assert.equal(textRequirements('# Only a heading')[0].text, '# Only a heading');
});

test('a complete SRS separates numbered requirements from supporting context without selecting lines', () => {
  const text = '# Shipping SRS\n\nPurpose and scope.\n\n## Functional requirements\n\nR1: Return zero at the threshold.\n\nR2: Reject negative amounts.\n\n## Execution environment\n\nPython 3.11.';
  const input = parseRequirementInput(text);
  assert.deepEqual(input.rules.map(rule => rule.originalId), ['R1', 'R2']);
  assert.equal(input.rules[1].text, 'R2: Reject negative amounts.');
  assert.ok(input.context.includes('Purpose and scope.'));
  assert.ok(input.context.includes('Python 3.11.'));
  assert.equal(input.text, text);
  assert.equal(input.mode, 'numbered');
});

test('Word/table identifiers and repeated acceptance examples keep one original requirement identity', () => {
  const input = parseRequirementInput('| FR-CAL-02 | Return today. |\n| FR-003 | Reject invalid input. |\n\n## Examples\n| FR-CAL-02 | An example date. |');
  assert.deepEqual(input.rules.map(rule => rule.originalId), ['FR-CAL-02', 'FR-003']);
  assert.ok(input.rules[0].text.includes('An example date.'));
  assert.ok(input.context.includes('## Examples'));
  assert.equal(parseRequirementInput('There is an R1 token inside prose.').mode, 'text');
});

test('multiple requirements in one original paragraph retain exact offset-bound citations', () => {
  const document = fixture();
  document.segments = [{ id: 'S1', text: 'R1: Return zero.\nR2: Reject negatives.', location: 'Page 1', page: 1 }];
  const input = parseRequirementInput(documentText(document), document);
  assert.equal(input.rules.length, 2);
  for (const rule of input.rules) assert.ok(sourceMatches(rule, ruleSources(rule)[0], document));
  const second = ruleSources(input.rules[1])[0];
  assert.ok(second.start! > 0);
  assert.equal(second.page, 1);
  assert.equal(sourceMatches(input.rules[1], { ...second, start: second.start! + 1 }, document), false);
  assert.equal(sourceMatches(input.rules[1], { ...second, quote: 'Invented quote' }, document), false);
});

test('numbered requirements are not silently merged or dropped at the former twelve-section limit', () => {
  const input = parseRequirementInput(Array.from({ length: 20 }, (_, i) => `FR-${i + 1}: The system shall return ${i}.`).join('\n\n'));
  assert.equal(input.rules.length, 20);
  assert.equal(input.rules[19].originalId, 'FR-20');
});
