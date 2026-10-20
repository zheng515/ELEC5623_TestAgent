import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialDocumentBlocks, numberedDocumentBlocks } from '../lib/document-selection';
import type { RequirementDocument } from '../lib/requirements';

test('default selection excludes uncertain OCR and respects the run input limits', () => {
  const document: RequirementDocument = { id: 'fixture', fileName: 'requirements.pdf', sha256: 'fixture', format: 'pdf', pages: [], warnings: [], segments: [
    { id: 'S1', text: 'Native requirement', location: 'Page 1', page: 1, extraction: 'text' },
    { id: 'S2', text: 'Uncertain transcription', location: 'Page 2', page: 2, extraction: 'ocr', confidence: 42 },
    { id: 'S3', text: 'Clear scanned requirement', location: 'Page 3', page: 3, extraction: 'ocr', confidence: 90 },
    { id: 'S4', text: 'Missing confidence', location: 'Page 4', page: 4, extraction: 'ocr' },
  ] };
  assert.deepEqual(initialDocumentBlocks(document), ['S1', 'S3']);
  document.segments[0].text = 'x'.repeat(12001);
  assert.deepEqual(initialDocumentBlocks(document), []);
  document.segments = Array.from({ length: 13 }, (_, index) => ({ id: 'S' + index, text: 'Requirement', location: 'Line ' + index }));
  assert.deepEqual(initialDocumentBlocks(document), []);
});

test('numbered selection preserves original blocks, excludes low-confidence OCR and never truncates', () => {
  const document: RequirementDocument = { id: 'fixture', fileName: 'SRS.md', sha256: 'fixture', format: 'md', pages: [], warnings: [], segments: [
    { id: 'S1', text: '# Functional requirements', location: 'Line 1' },
    { id: 'S2', text: 'R1: The fee must be zero.', location: 'Line 3' },
    { id: 'S3', text: 'FR-CAL-002\nInvalid inputs raise TypeError.', location: 'Body block 2, table row 1' },
    { id: 'S4', text: 'R3: Uncertain scan.', location: 'Page 2', extraction: 'ocr', confidence: 40 },
    { id: 'S5', text: '| R1 | 10000 | 0 |', location: 'Line 9' },
    { id: 'S6', text: 'Additional unnumbered rules must remain visible.', location: 'Line 11' },
  ] };
  const original = JSON.stringify(document);
  assert.deepEqual(numberedDocumentBlocks(document), { count: 2, ids: ['S2', 'S3'] });
  assert.equal(JSON.stringify(document), original, 'Selection must not rewrite requirement text or provenance');
  document.segments = Array.from({ length: 13 }, (_, index) => ({ id: 'S' + index, text: 'REQ-' + (index + 1) + ': A requirement.', location: 'Line ' + index }));
  assert.deepEqual(numberedDocumentBlocks(document), { count: 13, ids: [] });
  document.segments = [{ id: 'S1', text: 'R1: ' + 'x'.repeat(12000), location: 'Line 1' }];
  assert.deepEqual(numberedDocumentBlocks(document), { count: 1, ids: [] });
});
