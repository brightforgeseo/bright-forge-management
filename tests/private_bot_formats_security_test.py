"""Offline hostile packages only: no requests, credentials or persistent DB writes."""
import importlib.util
import io
import pathlib
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('formats', pathlib.Path(__file__).resolve().parents[1] / 'scripts/private-bot-formats.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)


def zipped(parts):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for key, value in parts.items():
            z.writestr(key, value)
    return out.getvalue()


class NativeSecurity(unittest.TestCase):
    def test_path_traversal_and_absolute(self):
        for name in ['../escape.xml', '/etc/passwd', 'C:/escape.xml', 'word/../../escape.xml', 'word\\escape.xml']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                f.package(zipped({name: '<root/>'}))

    def test_entities_doctype_utf8_and_utf16(self):
        xml = '<!DOCTYPE root [<!ENTITY leak SYSTEM "file:///not-a-real-fixture">]><root>&leak;</root>'
        for encoding in ['utf-8', 'utf-16']:
            with self.subTest(encoding=encoding), self.assertRaises(Exception):
                f.package(zipped({'word/document.xml': xml.encode(encoding)}))

    def test_external_relationships_and_active_content(self):
        for xml in ['<Relationships><Relationship TargetMode="External" Target="https://example.invalid/no-network"/></Relationships>', '<Relationships><Relationship Target="file:///fixture"/></Relationships>', '<root><f>1+1</f></root>', '<root><instrText>INCLUDETEXT</instrText></root>', '<root><definedName>1+1</definedName></root>']:
            with self.subTest(xml=xml), self.assertRaises(ValueError):
                f.package(zipped({'word/document.xml': xml}))
        for name in ['word/vbaProject.bin', 'xl/embeddings/object.bin', 'xl/externalLinks/link.xml']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                f.package(zipped({name: 'irrelevant'}))

    def test_zip_member_and_expansion_limits(self):
        with self.assertRaises(ValueError):
            f.package(zipped({str(i) + '.xml': '<r/>' for i in range(257)}))
        with self.assertRaises(ValueError):
            f.package(zipped({'huge.xml': '<r>' + 'x' * (4 * 1024 * 1024) + '</r>'}))

    def test_xlsx_literal_strings_not_formula_and_readback(self):
        values = [['=1+1', '+SUM(A1)', '-SUM(A1)', '@SUM(A1)', '\t=1', '\n=1', -12, 3.5]]
        data = f.write_xlsx({'rows': values})
        self.assertEqual(f.read_xlsx(data)['rows'], values)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = z.read('xl/worksheets/sheet1.xml').decode()
            self.assertNotIn('<f', xml)
            self.assertEqual(xml.count('t="inlineStr"'), 6)
            self.assertEqual(xml.count('t="n"'), 2)

    def test_formula_upload_rejected_and_multisheet_rejected(self):
        xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>'
        with self.assertRaises(ValueError):
            f.read_xlsx(zipped({'xl/worksheets/sheet1.xml': xml}))
        with self.assertRaises(ValueError):
            f.read_xlsx(zipped({'xl/worksheets/sheet1.xml': '<r/>', 'xl/worksheets/sheet2.xml': '<r/>'}))

    def test_invalid_and_oversized_cell_values(self):
        for value in [[['x' * 32768]], [[float('inf')]], [[True]], [[{}]], [[None]]]:
            with self.subTest(value_type=type(value[0][0]).__name__), self.assertRaises(ValueError):
                f.write_xlsx({'rows': value})
        for ref in ['A0', 'A10001', 'ZZZ1', '../A1']:
            with self.assertRaises(ValueError):
                f.column(ref)

    def test_sparse_worksheet_cannot_expand_beyond_cell_budget(self):
        # Only 501 explicit cells but 100200 padded cells: must fail before output.
        cells = ''.join(f'<row r="{r}"><c r="GR{r}" t="inlineStr"><is><t>x</t></is></c></row>' for r in range(1, 502))
        xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + cells + '</sheetData></worksheet>'
        with self.assertRaises(ValueError):
            f.read_xlsx(zipped({'xl/worksheets/sheet1.xml': xml}))

    def test_docx_independent_library_readback_and_projection(self):
        from docx import Document
        data = f.write_docx({'text': 'Source evidence\nEdited result'})
        native = Document(io.BytesIO(data))
        self.assertEqual([p.text for p in native.paragraphs], ['Source evidence', 'Edited result'])
        self.assertEqual(f.read_docx(data)['text'], 'Source evidence\nEdited result')

    def test_pdf_real_generator_and_poppler_readback(self):
        data = f.write_pdf({'text': 'PDF verified finding\nEvidence source: example.com'})
        self.assertTrue(data.startswith(b'%PDF-'))
        self.assertIn('PDF verified finding', f.read_pdf(data)['text'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
