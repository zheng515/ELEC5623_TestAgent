# Requirement document import

## User workflow and acceptance checks

1. Run `bash scripts/setup.sh`, `bash scripts/setup-document-tools.sh`, then `bash scripts/dev.sh`. Open `http://localhost:3000`, sign in, and open **New verification task**.
2. Select **Import .txt, .md, PDF, or Word (.docx, .doc)** and upload a text-based PDF with different rules on two pages. The requirement text is populated automatically. Expand **Extracted text by source location**: both pages must show their corresponding text and physical page numbers.
3. Repeat with a Word `.docx` containing ordinary paragraphs and a table, then with a legacy binary `.doc`. Legacy files are converted automatically and their positions are labeled **converted paragraph**. Text must appear in document order with paragraph numbers. Empty paragraphs count toward numbering. Table-cell paragraphs are included; original table layout is not reconstructed.
4. Enter a project name and a valid GitHub repository URL, then create the task. Reopen the task or restart the backend: the extracted source metadata remains saved. In **Specification analysis scope**, expand **Imported text by source location**. This works even without model credentials; a setup-only run still does not analyze requirements.
5. With model credentials configured, run analysis. Expand **Recorded source quote links**: each uniquely located requirement quote shows its filename and page or paragraph. Quotes spanning two locations show both. Repeated quotes remain ambiguous and are not assigned an arbitrary original location. Test-plan source evidence also shows available locations.
6. Download the JSON and HTML reports. Both preserve document metadata; HTML displays text by location and analyzed quote locations. This does not prove that every requirement was extracted or correctly understood.
7. Upload a clear image-only/scanned PDF. Requirement text must be populated automatically with original page numbers and OCR labels/scores. Mixed PDFs retain native text and recognized scan text in original page order. OCR errors, unreadable pages, and low-confidence words must appear explicitly; scores do not prove transcription accuracy. Disable OCR or configure a missing Tesseract binary: an all-scan import must fail with an actionable message, while mixed files retain available text and list omitted pages. Failed imports preserve previous inputs.
8. Edit successfully imported requirement text. The file preview disappears and a message explains that original locations were cleared. Reimport the original to restore them. Changing project name, description, repository, or goal retains source locations.
9. Try an encrypted PDF, malformed file, a file above 5 MB, a PDF above 100 pages, more than 20 pages needing OCR, or extracted text above 50,000 characters. Import must reject it with an actionable message; it must not silently truncate text or replace previous inputs.

## API

All endpoints require the existing session cookie and JSON writes. There is no multipart endpoint.

`POST /api/v1/documents/import` accepts:

```json
{
  "filename": "requirements.pdf",
  "content_base64": "<base64-encoded file bytes>"
}
```

The response contains `id`, `filename`, `format`, `sha256`, `text`, `segments`, and `warnings`.
Each segment contains `filename`, `kind` (`page` or `paragraph`), `number`, `start`, `end`,
`method` (`text`, `ocr`, or `converted`), and nullable `confidence` (mean OCR word score, 0–100).
Offsets use Python Unicode code points for backend quote matching; the
frontend converts Python code-point offsets before slicing text so supplementary Unicode
characters do not shift source previews. Ranges are half-open and refer to the returned text.

Create a project with the returned text and `requirement_document_id`. The server checks
ownership and exact text equality, and attaches its own immutable document snapshot. Clients
cannot provide arbitrary provenance. Omit or clear the ID when supplying edited/manual text.
Projects, runs, and JSON/HTML reports retain the extracted text and provenance; the original
binary file is not retained or offered for download. Keep the original file to inspect its
physical page or paragraph. Document imports do not require or invoke a language model.

## Extraction boundaries

- PDF pages use physical numbering starting at 1, independent of printed page labels. Text reading order, tables, diagrams, and image text may be lost. Every PDF import displays this limitation.
- Word paragraphs use body document order, including empty and table-cell paragraphs. Word page numbers depend on rendering and are not invented. Headers, footers, footnotes, endnotes, comments, deleted tracked-change text, images, and text boxes are excluded. Inserted text is included; complex revisions and table layout require checking against the original.
- Scanned/image-only and sparse native-heading PDF pages are rendered with PDFium and recognized with local Tesseract. The default language is English. OCR replaces text on candidate pages rather than appending duplicate text. Pages with substantial native text retain their native text layer; embedded image text on these pages is not separately recognized. Unreadable/blank pages are listed explicitly.
- OCR words, especially digits, operators, small print, handwriting, rotated scans, and complex tables, may be incorrect. Mean word confidence is an engine score rather than measured accuracy. Words below 60/100 produce a warning; every recognized page is labeled OCR. The original PDF page number is retained.
- Binary `.doc` files are converted using macOS textutil or Linux LibreOffice with a fresh profile and high macro security. The original file hash/filename is retained. Converted paragraph numbers refer to the resulting body, not guaranteed original Word positions. Files renamed from other formats are rejected; encrypted/damaged files may fail conversion.
- Source links establish quote provenance only. Missing-page warnings carry into analysis and exported reports. They are not evidence of complete extraction or semantic correctness.

The PDF text parser uses [pypdf](https://github.com/py-pdf/pypdf/blob/main/docs/user/extract-text.md), rendering uses [pypdfium2](https://pypdfium2.readthedocs.io/en/stable/python_api.html), and recognition uses [Tesseract TSV](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html). Word uses bounded ZIP extraction and [defusedxml](https://github.com/tiran/defusedxml/blob/main/README.md), with DTD/entities forbidden. Linux conversion uses [LibreOffice CLI](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html); macOS uses the system `textutil` command.

## Dependencies and settings

Run `bash scripts/setup-document-tools.sh`. macOS installs Tesseract with Homebrew and
uses built-in textutil. Debian/Ubuntu installs Tesseract, English language data, and
LibreOffice Writer; elevated package-manager access may be needed. Other Linux distributions
need equivalent packages installed with their package manager. Python PDFium/Pillow
packages are installed by `scripts/setup.sh` from the backend lockfile.

For other languages, install matching Tesseract language packs (for example macOS
`brew install tesseract-lang`, or Ubuntu `tesseract-ocr-chi-sim`) and set
`REQTEST_DOCUMENT_OCR_LANGUAGES=eng+chi_sim`. The task form shows current readiness;
authenticated `GET /api/v1/documents/capabilities` returns OCR/language/converter status
and import timeout. Missing tools or configured language data cannot silently produce
an apparently complete scan extraction.

| Setting | Default | Purpose |
| --- | --- | --- |
| `REQTEST_DOCUMENT_OCR_ENABLED` | `true` | Enable automatic candidate-page OCR |
| `REQTEST_DOCUMENT_OCR_LANGUAGES` | `eng` | Installed Tesseract language IDs joined with `+` |
| `REQTEST_DOCUMENT_TESSERACT_BINARY` | `tesseract` | OCR executable name or absolute path |
| `REQTEST_DOCUMENT_CONVERTER_BINARY` | `soffice` | Linux LibreOffice executable; macOS uses textutil |
| `REQTEST_DOCUMENT_OCR_MAX_PAGES` | `20` | Maximum candidate OCR pages before rejecting an import |
| `REQTEST_DOCUMENT_IMPORT_TIMEOUT_SECONDS` | `120` | Overall import deadline; browser adds 15 seconds |

Parsing runs in a separate process group with a global deadline; tool processes are
terminated when it finishes or times out. Parent-owned temporary folders remove raw
files and rendered images even on timeout. Each tool has a bounded runtime, rendered
pages are capped at 12 million pixels, and temporary output files at 25 MB. The parser
CPU limit is 60 seconds; Linux additionally limits address space to 1 GB. macOS does
not enforce that address-space limit. File (5 MB), Word ZIP (20 MB/2,000 entries), page,
OCR-page, text, and output limits reject excessive documents without silent truncation.
These are process/resource controls, not a full security sandbox for public deployments.

## Automated verification

Run `bash scripts/check.sh` for the repository checks. Focused tests:

```bash
backend/.venv/bin/pytest backend/tests/test_documents.py -q
cd frontend
npm test
```

Tests cover real in-memory PDF/OOXML inputs, paragraph/table ordering, source offsets,
repeated and cross-page quotes, missing-text warnings, size/page/text limits, unsafe XML,
timeouts, authentication, cross-account access, persistence, report exports, and frontend
import/edit/error behavior. Real OCR tests run when Tesseract is installed; real macOS
`.doc` conversion tests use textutil. Pure tests mock missing tools/failures. No real
model calls are needed. Linux LibreOffice is covered by command/fixture tests; test
with representative legacy files on Linux before deploying that converter.
