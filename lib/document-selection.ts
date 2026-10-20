import type { RequirementDocument, RequirementSource } from './requirements';

// This threshold flags uncertain transcription; it is not an accuracy measure.
export function uncertainOcr(source: Pick<RequirementSource, 'extraction' | 'confidence'>) {
  return source.extraction === 'ocr' && (source.confidence === undefined || source.confidence < 70);
}
export function initialDocumentBlocks(document: RequirementDocument) {
  const candidates = document.segments.filter(segment => !uncertainOcr(segment));
  return candidates.length <= 12 && candidates.reduce((sum, segment) => sum + segment.text.length, 0) <= 12000 ? candidates.map(segment => segment.id) : [];
}
