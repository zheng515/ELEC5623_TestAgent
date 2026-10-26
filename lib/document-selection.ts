import type { RequirementSource } from './requirements';

// This threshold flags uncertain transcription; it is not an accuracy measure.
export function uncertainOcr(source: Pick<RequirementSource, 'extraction' | 'confidence'>) {
  return source.extraction === 'ocr' && (source.confidence === undefined || source.confidence < 70);
}
