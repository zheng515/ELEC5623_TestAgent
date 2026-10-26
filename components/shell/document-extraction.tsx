import type { RequirementDocument, RequirementSource } from '@/lib/requirements';
import { uncertainOcr } from '@/lib/document-selection';

export function OriginalPageLink({ documentId, page }: { documentId: string; page?: number }) {
  return page ? <a className="inline-block ml-2 underline text-xs" href={'/api/requirements?id=' + encodeURIComponent(documentId) + '&view=inline#page=' + page} target="_blank" rel="noreferrer">View original page {page}</a> : null;
}

export function OcrConfidence({ source }: { source: Pick<RequirementSource, 'extraction' | 'confidence'> }) {
  if (source.extraction !== 'ocr') return null;
  return <span className={'block text-xs ' + (uncertainOcr(source) ? 'text-red-400' : 'text-muted-foreground')}>English OCR · confidence {source.confidence === undefined ? 'unavailable' : source.confidence + '%'}{uncertainOcr(source) ? ' · Low confidence: compare with the original' : ''}</span>;
}

export function DocumentExtraction({ document }: { document: Pick<RequirementDocument, 'warnings'> & Partial<Pick<RequirementDocument, 'pages' | 'format'>> }) {
  const pages = document.pages || [];
  const limited = pages.filter(page => ['partial', 'unreadable', 'failed', 'skipped'].includes(page.status));
  return <div className="space-y-2 text-sm">
    {pages.length > 0 && <>
      <p className={limited.length ? 'text-red-400' : 'text-muted-foreground'}>PDF extraction: {pages.length} pages processed · {limited.length} pages with extraction limitations.</p>
      <details><summary className="cursor-pointer">Page extraction details</summary><ul className="space-y-2 mt-2">{pages.map(page => <li key={page.page}>Page {page.page} · {page.status}{page.confidence === undefined ? '' : ' · OCR confidence ' + page.confidence + '%'}<p className="text-muted-foreground">{page.detail}</p></li>)}</ul></details>
    </>}
    {document.format === 'doc' && <p>Converted Word document: citations use converted body blocks, not original page numbers.</p>}
    {document.format === 'docx' && <p>Word citations use body blocks and table rows; rendered page numbers are unavailable.</p>}
    <details><summary className="cursor-pointer">Extraction limits and warnings ({document.warnings.length})</summary>{document.warnings.map((warning, index) => <p className="text-muted-foreground mt-2" key={index}>{warning}</p>)}</details>
  </div>;
}
