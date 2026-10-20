import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialDocumentBlocks } from '../lib/document-selection';
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
