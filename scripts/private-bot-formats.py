"""Private file codecs. Fixed stdin JSON protocol; no input paths or network.
OOXML input is projected to plain text/cells, never retained as executable content.
"""
import base64
import io
import json
import math
import posixpath
import resource
import subprocess
import sys
import zipfile
from xml.sax.saxutils import escape
from defusedxml import ElementTree as ET

MAX_BYTES = 2 * 1024 * 1024
MAX_TEXT = 60000
MAX_ROWS = 10000
MAX_COLS = 200
MAX_CELLS = 100000
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def text(value):
    if not isinstance(value, str) or len(value) > MAX_TEXT:
        raise ValueError('TEXT_LIMIT')
    if any((ord(c) < 32 and c not in '\t\r\n') or 0xD800 <= ord(c) <= 0xDFFF or ord(c) in (0xFFFE, 0xFFFF) for c in value):
        raise ValueError('INVALID_TEXT')
    return value


def rows_check(rows):
    if not isinstance(rows, list) or len(rows) > MAX_ROWS:
        raise ValueError('ROWS_LIMIT')
    count = 0
    for row in rows:
        if not isinstance(row, list) or len(row) > MAX_COLS:
            raise ValueError('COLUMNS_LIMIT')
        count += len(row)
        if count > MAX_CELLS:
            raise ValueError('CELLS_LIMIT')
        for v in row:
            if isinstance(v, str):
                text(v)
                if len(v) > 32767:
                    raise ValueError('CELL_LIMIT')
            elif type(v) not in (int, float, bool) or not math.isfinite(v):
                raise ValueError('INVALID_CELL')
    return rows


def package(data, read_only=False):
    z = zipfile.ZipFile(io.BytesIO(data))
    entries = z.infolist()
    if len(entries) > 256 or sum(i.file_size for i in entries) > 16 * 1024 * 1024:
        raise ValueError('ZIP_LIMIT')
    names = set()
    trees = {}
    for i in entries:
        n = i.filename
        if n in names or '\\' in n or n.startswith('/') or ':' in n or any(p in ('..', '.') for p in n.split('/')):
            raise ValueError('ZIP_PATH')
        names.add(n)
        if i.flag_bits & 1 or i.file_size > 4 * 1024 * 1024 or i.file_size > max(1, i.compress_size) * 1000 or (i.external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError('ZIP_LIMIT')
        if any(x in n.lower() for x in ('vbaproject', 'macros', 'embeddings/', 'externallinks/', 'activex/', 'customui/')):
            raise ValueError('ACTIVE_CONTENT')
        if n.endswith(('.xml', '.rels')):
            root = ET.fromstring(z.read(i), forbid_dtd=True, forbid_entities=True, forbid_external=True)
            trees[n] = root
            for node in root.iter():
                tag = node.tag.split('}')[-1]
                if tag in (('instrText', 'fldSimple', 'altChunk', 'oleObject') if read_only else ('f', 'definedName', 'instrText', 'fldSimple', 'altChunk', 'oleObject')):
                    raise ValueError('ACTIVE_CONTENT')
                if tag == 'Relationship':
                    target = node.get('Target', '')
                    if read_only and node.get('TargetMode', '').lower() == 'external' and node.get('Type','').endswith('/hyperlink'):
                        # Inert display link. Never dereference external targets.
                        continue
                    if read_only and target.startswith('/xl/'):
                        if target.lstrip('/') not in {entry.filename for entry in entries}:
                            raise ValueError('ZIP_PATH')
                        continue
                    if node.get('TargetMode', '').lower() == 'external' or ':' in target or '\\' in target or target.startswith('/'):
                        raise ValueError('EXTERNAL_RELATIONSHIP')
                    # Relative package relationships may legitimately contain ../;
                    # resolve against their package directory, never a host path.
                    folder = posixpath.dirname(posixpath.dirname(n))
                    resolved = posixpath.normpath(posixpath.join(folder, target))
                    if resolved.startswith('../'):
                        raise ValueError('ZIP_PATH')
    return trees


def read_docx(data):
    trees = package(data)
    root = trees.get('word/document.xml')
    if root is None:
        raise ValueError('INVALID_DOCX')
    lines = []
    for p in root.iter(W + 'p'):
        lines.append(''.join(n.text or '' if n.tag == W + 't' else '\t' if n.tag == W + 'tab' else '\n' if n.tag in (W + 'br', W + 'cr') else '' for n in p.iter()))
    return {'text': text('\n'.join(lines)), 'projection': 'body paragraphs and table text; formatting/headers/images not retained'}


def column(ref):
    import re
    m = re.fullmatch(r'([A-Z]{1,3})([1-9][0-9]{0,6})', ref)
    if not m:
        raise ValueError('INVALID_CELL_REFERENCE')
    col = 0
    for c in m[1]:
        col = col * 26 + ord(c) - 64
    if col > MAX_COLS or int(m[2]) > MAX_ROWS:
        raise ValueError('CELLS_LIMIT')
    return col - 1, int(m[2]) - 1


def read_xlsx_sheet(trees, sheet):
    shared = trees.get('xl/sharedStrings.xml')
    strings = [] if shared is None else [''.join(n.text or '' for n in si.iter(S + 't')) for si in shared]
    rows = []
    padded_cells = 0
    seen = set()
    for cell in trees[sheet].iter(S + 'c'):
        c, r = column(cell.get('r', ''))
        if (r, c) in seen or len(seen) >= MAX_CELLS:
            raise ValueError('CELLS_LIMIT')
        seen.add((r, c))
        while len(rows) <= r:
            rows.append([])
        padded_cells += max(0, c + 1 - len(rows[r]))
        if padded_cells > MAX_CELLS:
            raise ValueError('CELLS_LIMIT')
        while len(rows[r]) <= c:
            rows[r].append('')
        kind = cell.get('t', 'n')
        value = cell.findtext(S + 'v', '')
        if kind == 'inlineStr':
            value = ''.join(n.text or '' for n in cell.iter(S + 't'))
        elif kind == 's':
            if not value.isdigit() or int(value) >= len(strings):
                raise ValueError('INVALID_SHARED_STRING')
            value = strings[int(value)]
        elif kind == 'b':
            if value not in ('0', '1'): raise ValueError('INVALID_CELL')
            value = value == '1'
        elif kind == 'n' and value:
            value = float(value)
            if not math.isfinite(value):
                raise ValueError('INVALID_CELL')
        elif kind not in ('str', 'b', 'e', 'd', 'n'):
            raise ValueError('INVALID_CELL_TYPE')
        rows[r][c] = value
    return rows_check(rows)


def read_xlsx(data, business=False):
    trees = package(data, read_only=True)
    workbook=trees.get('xl/workbook.xml')
    rels=trees.get('xl/_rels/workbook.xml.rels')
    if workbook is None or rels is None:
        raise ValueError('INVALID_XLSX')
    targets={x.get('Id'):posixpath.normpath('xl/'+x.get('Target','')) if not x.get('Target','').startswith('/') else x.get('Target').lstrip('/') for x in rels if x.get('Type','').endswith('/worksheet') and x.get('TargetMode','').lower()!='external'}
    sheets=[];total=0;withheld=0
    import re
    for tab in workbook.iter(S+'sheet'):
        if len(sheets)>=20:
            raise ValueError('SHEET_LIMIT')
        name=tab.get('name','')
        if re.search(r'password|credential|login|private|payroll|bank|secret',name,re.I) or business and tab.get('state','visible')!='visible':
            withheld+=1;continue
        target=targets.get(tab.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'))
        if target not in trees or not target.startswith('xl/worksheets/'):
            raise ValueError('INVALID_WORKSHEET')
        if business and (any(n.tag in (S+'row',S+'col') and n.get('hidden') in ('1','true') for n in trees[target].iter()) or any(n.tag==S+'f' for n in trees[target].iter())):
            # Formula caches may depend on a withheld tab. Do not treat them as public literals.
            withheld+=1;continue
        rows=read_xlsx_sheet(trees,target);total+=sum(len(r) for r in rows)
        if total>MAX_CELLS:
            raise ValueError('CELLS_LIMIT')
        # Inspect decoded cell boundaries, not JSON-escaped representations.
        # Security/password-reset research is not a credential assignment.
        decoded = '\n'.join(str(v) for row in rows for v in row)
        if re.search(r'''(?:^|[\s{,;|])["']?(?:password|passwd|api[_ -]?key|refresh[_ -]?token|client[_ -]?secret|authorization)["']?[ \t]*(?:[:=|\t]|\r?\n)\s*[^\s|},;]''', decoded, re.I):
            if business:withheld+=1;continue
            raise ValueError('SENSITIVE_CONTENT')
        if business:
            import pathlib
            check="const fs=require('node:fs');try{const v=JSON.parse(fs.readFileSync(0,'utf8'));const c=require('./private-bot-business-classification.cjs');if(c.privateName(v.name,true))throw Error();c.safeRows(v.rows);c.safeText(v.links);process.stdout.write('OK')}catch{process.exitCode=1}"
            relpath=posixpath.dirname(target)+'/_rels/'+posixpath.basename(target)+'.rels'
            links=[x.get('Target','') for x in trees.get(relpath,[]) if x.get('TargetMode','').lower()=='external']
            checked=subprocess.run(['node','-e',check],input=json.dumps({'name':name,'rows':rows,'links':links}).encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,cwd=pathlib.Path(__file__).parent,timeout=3)
            if checked.returncode or checked.stdout!=b'OK':withheld+=1;continue
        sheets.append({'name':name,'rows':rows})
    if not sheets:
        raise ValueError('NO_READABLE_WORKSHEETS')
    result={'sheets':sheets,'projection':'Named worksheet cells; cached formula values only, never evaluated. Hyperlinks never fetched. Sensitive-named tabs withheld. Styles and rendered layout not verified.'}
    if business:
        result['withheldTabs']=withheld
        result['projection']='Visible classified business worksheet literal cells only; private, hidden-dimension, formula and unclassified tabs withheld. Sparse coordinates retained. Links classified but not fetched or preserved as formatting.'
    if len(sheets)==1:
        result['rows']=sheets[0]['rows']
    if len(json.dumps(result).encode())>MAX_BYTES:
        raise ValueError('TEXT_LIMIT')
    return result


def write_docx(doc):
    from docx import Document
    d = Document()
    for line in text(doc['text']).split('\n'):
        d.add_paragraph(line)
    out = io.BytesIO()
    d.save(out)
    return out.getvalue()


def write_xlsx(doc):
    rows = rows_check(doc['rows'])
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    body = []
    for r, row in enumerate(rows, 1):
        cells = []
        for c, v in enumerate(row, 1):
            letters = ''
            while c:
                c, rem = divmod(c - 1, 26)
                letters = chr(65 + rem) + letters
            ref = letters + str(r)
            if isinstance(v, str):
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(v)}</t></is></c>')
            else:
                cells.append(f'<c r="{ref}" t="n"><v>{v}</v></c>')
        body.append(f'<row r="{r}">' + ''.join(cells) + '</row>')
    parts = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': f'<worksheet xmlns="{ns}"><sheetData>' + ''.join(body) + '</sheetData></worksheet>',
    }
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, content in parts.items():
            z.writestr(name, '<?xml version="1.0" encoding="UTF-8"?>' + content)
    return out.getvalue()


def normalise_xlsx(data):
    sheets=read_xlsx(data)['sheets'];parts={};sheet_xml=[];relations=[];types=[]
    for i,sheet in enumerate(sheets,1):
        with zipfile.ZipFile(io.BytesIO(write_xlsx({'rows':sheet['rows']}))) as z:
            if i==1:
                parts={n:z.read(n) for n in z.namelist() if n!='xl/worksheets/sheet1.xml'}
            parts[f'xl/worksheets/sheet{i}.xml']=z.read('xl/worksheets/sheet1.xml')
        sheet_xml.append(f'<sheet name="{escape(sheet["name"], {chr(34):"&quot;"})}" sheetId="{i}" r:id="rId{i}"/>')
        relations.append(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>')
        types.append(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    parts['xl/workbook.xml']=('<workbook xmlns="'+S[1:-1]+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(sheet_xml)+'</sheets></workbook>').encode()
    parts['xl/_rels/workbook.xml.rels']=('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(relations)+'</Relationships>').encode()
    parts['[Content_Types].xml']=parts['[Content_Types].xml'].replace(b'</Types>',(''.join(types[1:])+'</Types>').encode())
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for n,v in parts.items():z.writestr(n,v)
    return out.getvalue()


def write_pdf(doc):
    import cairo
    import textwrap
    value = text(doc['text'])
    out = io.BytesIO()
    surface = cairo.PDFSurface(out, 595, 842)
    ctx = cairo.Context(surface)
    ctx.select_font_face('Sans')
    ctx.set_font_size(11)
    y = 45
    for paragraph in value.split('\n'):
        for line in textwrap.wrap(paragraph.expandtabs(4), width=80) or ['']:
            if y > 800:
                ctx.show_page()
                y = 45
            ctx.move_to(40, y)
            ctx.show_text(line)
            y += 15
    surface.finish()
    return out.getvalue()


def read_pdf(data):
    if not data.startswith(b'%PDF-'):
        raise ValueError('INVALID_PDF')
    # Fixed executable and stdin/stdout only. No path/URL arguments from callers.
    result = subprocess.run(['/usr/sbin/pdftotext', '-enc', 'UTF-8', '-', '-'], input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, check=True)
    if len(result.stdout) > MAX_BYTES:
        raise ValueError('TEXT_LIMIT')
    return {'text': text(result.stdout.decode('utf-8').replace('\x0c', '\n')), 'projection': 'text layer only; no OCR, layout or attachments'}


def main():
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (12, 12))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    raw = sys.stdin.buffer.read(4 * MAX_BYTES + 1)
    if len(raw) > 4 * MAX_BYTES:
        raise ValueError('INPUT_LIMIT')
    req = json.loads(raw)
    operation, fmt = req['operation'], req['format']
    if operation == 'decode' and set(req) == {'operation', 'format', 'base64'}:
        data = base64.b64decode(req['base64'], validate=True)
        if len(data) > MAX_BYTES:
            raise ValueError('INPUT_LIMIT')
        result = {'docx': read_docx, 'xlsx': read_xlsx, 'pdf': read_pdf}[fmt](data)
    elif operation == 'normalise' and fmt=='xlsx' and set(req)=={'operation','format','base64'}:
        data=base64.b64decode(req['base64'],validate=True)
        if len(data)>MAX_BYTES:raise ValueError('INPUT_LIMIT')
        result={'base64':base64.b64encode(normalise_xlsx(data)).decode('ascii')}
    elif operation == 'encode' and set(req) == {'operation', 'format', 'document'}:
        doc = req['document']
        if isinstance(doc,dict) and set(doc)=={'design'} and fmt in ('docx','xlsx'):
            import importlib.util
            from pathlib import Path
            spec=importlib.util.spec_from_file_location('private_design',Path(__file__).with_name('private-bot-design.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
            data,projection=mod.render(doc['design'],fmt,write_xlsx)
            if len(data)>MAX_BYTES:raise ValueError('OUTPUT_LIMIT')
            print(json.dumps({'base64':base64.b64encode(data).decode('ascii'),'projection':projection,'styled':True}));return
        if set(doc) != ({'rows'} if fmt == 'xlsx' else {'text'}):
            raise ValueError('INVALID_DOCUMENT')
        data = {'docx': write_docx, 'xlsx': write_xlsx, 'pdf': write_pdf}[fmt](doc)
        if len(data) > MAX_BYTES:
            raise ValueError('OUTPUT_LIMIT')
        result = {'base64': base64.b64encode(data).decode('ascii')}
    else:
        raise ValueError('INVALID_ARGUMENTS')
    print(json.dumps(result, ensure_ascii=True, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'error': 'INVALID_OR_UNSUPPORTED_FILE'}))
        sys.exit(1)
