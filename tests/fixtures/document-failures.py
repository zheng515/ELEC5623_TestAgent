"""Controlled failure tests; these do not measure OCR transcription accuracy."""
import base64
from io import BytesIO
import subprocess
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, "/tool")
import documents
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject


def pdf_job(count=3, native=True):
    writer = PdfWriter()
    for _ in range(count):
        writer.add_blank_page(width=612, height=792)
    if native:
        page = writer.pages[0]
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        stream = DecodedStreamObject()
        stream.set_data(b'BT /F1 12 Tf 40 740 Td (The shipping fee is zero.) Tj ET')
        page[NameObject('/Contents')] = writer._add_object(stream)
    data = BytesIO(); writer.write(data)
    return {'format': 'pdf', 'data': base64.b64encode(data.getvalue()).decode()}


class ExtractionFailures(unittest.TestCase):
    def test_partial_pages_preserve_native_text_and_low_confidence_source(self):
        with patch.object(documents, 'ocr_page', side_effect=[('Negative amounts raise ValueError.', 42.0), subprocess.TimeoutExpired('ocr', 1)]):
            result = documents.extract_document(pdf_job())
        self.assertEqual([page['status'] for page in result['pages']], ['text', 'partial', 'failed'])
        self.assertEqual([segment['page'] for segment in result['segments']], [1, 2])
        self.assertEqual(result['segments'][1]['confidence'], 42.0)
        self.assertTrue(any('Page 3' in warning for warning in result['warnings']))

    def test_every_image_page_is_attempted_without_a_page_or_time_budget(self):
        with patch.object(documents, 'ocr_page', return_value=('A requirement.', 90)) as ocr:
            result = documents.extract_document(pdf_job(30))
        self.assertEqual(ocr.call_count, 29)
        self.assertEqual(len(result['pages']), 30)
        self.assertNotIn('skipped', [page['status'] for page in result['pages']])

    def test_all_failed_pages_explain_recovery_action(self):
        with patch.object(documents, 'ocr_page', side_effect=OSError('unavailable')):
            with self.assertRaisesRegex(ValueError, 'No readable requirement text.*Page 1'):
                documents.extract_document(pdf_job(1, native=False))

    def test_broken_text_layer_falls_back_to_ocr(self):
        with patch('pypdf._page.PageObject.extract_text', side_effect=ValueError('broken text')), patch.object(documents, 'ocr_page', return_value=('A recovered requirement.', 93)):
            result = documents.extract_document(pdf_job(1))
        self.assertEqual(result['segments'][0]['extraction'], 'ocr')
        self.assertEqual(result['segments'][0]['page'], 1)

    def test_conversion_failure_messages_are_actionable(self):
        data = bytes.fromhex('D0CF11E0A1B11AE1') + b'invalid'
        for failure, message in [(subprocess.TimeoutExpired('libreoffice', 45), 'timed out'), (OSError('unavailable'), 'conversion failed')]:
            with self.subTest(message=message), patch.object(documents, 'run', side_effect=failure):
                with self.assertRaisesRegex(ValueError, message + '.*DOCX'):
                    documents.convert_doc(data)
        with patch.object(documents, 'run', return_value=''):
            with self.assertRaisesRegex(ValueError, 'produced no readable document'):
                documents.convert_doc(data)

    def test_render_and_ocr_share_the_remaining_time_budget(self):
        with patch.object(documents.time, 'monotonic', side_effect=[0, 3]), patch.object(documents, 'run', return_value='') as run:
            documents.ocr_page(b'fixture', 1, 5)
        self.assertEqual(run.call_args_list[0].args[1], 5)
        self.assertEqual(run.call_args_list[1].args[1], 2)
        with patch.object(documents.time, 'monotonic', side_effect=[0, 6]), patch.object(documents, 'run', return_value='') as run:
            with self.assertRaises(subprocess.TimeoutExpired):
                documents.ocr_page(b'fixture', 1, 5)
        self.assertEqual(run.call_count, 1)


unittest.main()
