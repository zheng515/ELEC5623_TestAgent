# Requirement document import

## User workflow and acceptance checks

1. Run `bash scripts/setup.sh`, then `bash scripts/dev.sh`. Open `http://localhost:3000`, sign in, and open **New verification task**.
2. Select **Import .txt, .md, PDF, or Word (.docx)** and upload a text-based PDF with different rules on two pages. The requirement text is populated automatically. Expand **Extracted text by source location**: both pages must show their corresponding text and physical page numbers.
3. Repeat with a Word `.docx` containing ordinary paragraphs and a table. Text must appear in document order with paragraph numbers. Empty paragraphs count toward numbering. Table-cell paragraphs are included; original table layout is not reconstructed.
4. Enter a project name and a valid GitHub repository URL, then create the task. Reopen the task or restart the backend: the extracted source metadata remains saved. In **Specification analysis scope**, expand **Imported text by source location**. This works even without model credentials; a setup-only run still does not analyze requirements.
5. With model credentials configured, run analysis. Expand **Recorded source quote links**: each uniquely located requirement quote shows its filename and page or paragraph. Quotes spanning two locations show both. Repeated quotes remain ambiguous and are not assigned an arbitrary original location. Test-plan source evidence also shows available locations.
6. Download the JSON and HTML reports. Both preserve document metadata; HTML displays text by location and analyzed quote locations. This does not prove that every requirement was extracted or correctly understood.
7. Upload an image-only/scanned PDF. Import must fail with an English message explaining that no text could be extracted and OCR is unsupported. Existing requirement text remains unchanged. A mixed PDF with text and pages without extractable text must explicitly list those pages as not analyzed; they may be blank or scanned.
8. Edit successfully imported requirement text. The file preview disappears and a message explains that original locations were cleared. Reimport the original to restore them. Changing project name, description, repository, or goal retains source locations.
9. Try an encrypted PDF, malformed file, legacy `.doc`, a file above 5 MB, a PDF above 100 pages, or extracted text above 50,000 characters. Import must reject it with an actionable message; it must not silently truncate text or replace previous inputs.

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
Each segment contains `filename`, `kind` (`page` or `paragraph`), `number`, `start`, and `end`.
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
- Scanned/image-only files need OCR, which is not implemented. Pages without extractable text are explicitly identified, but the parser cannot determine whether an empty page is blank or scanned.
- Source links establish quote provenance only. Missing-page warnings carry into analysis and exported reports. They are not evidence of complete extraction or semantic correctness.

The PDF parser uses [pypdf](https://github.com/py-pdf/pypdf/blob/main/docs/user/extract-text.md).
Word uses bounded ZIP extraction and [defusedxml](https://github.com/tiran/defusedxml/blob/main/README.md), with DTD/entities forbidden and no external resource retrieval.
Document parsing runs in a separate process with a 20-second wall timeout and 10-second CPU
limit. Linux additionally limits address space to 512 MB. macOS does not enforce that
address-space limit. Uploaded bytes, aggregate Word ZIP contents (20 MB), entry count (2,000),
pages, and extracted text are bounded on both platforms. These controls do not substitute
for deployment-level isolation of a publicly hosted parser.

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
import/edit/error behavior. No real model calls or OCR are needed for these checks.
