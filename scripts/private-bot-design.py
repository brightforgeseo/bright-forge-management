"""Fixed typed design renderer. Reuses the installed DOCX codec, no file paths/network."""
import io, json, re, zipfile
from xml.sax.saxutils import escape

def hexcolour(v):
    if not isinstance(v,str) or not re.fullmatch('[0-9A-Fa-f]{6}',v): raise ValueError('COLOUR')
    return v.upper()

def validate(d,fmt):
    if not isinstance(d,dict) or set(d)-{'title','accent','blocks','sheets'}:raise ValueError('DESIGN')
    accent=hexcolour(d.get('accent','264C73'))
    def text(v):
        if not isinstance(v,str) or len(v)>10000 or re.search(r'[\x00-\x08\x0b-\x1f]',v):raise ValueError('TEXT')
        return v
    text(d.get('title',''))
    if fmt=='docx':
        if set(d)-{'title','accent','blocks'} or not isinstance(d.get('blocks'),list) or len(d['blocks'])>200:raise ValueError('DESIGN')
        lines=[d['title']] if d.get('title') else []
        for b in d['blocks']:
            if not isinstance(b,dict):raise ValueError('BLOCK')
            if set(b)=={'text','style'} and b['style'] in ('paragraph','heading1','heading2','quote'):
                lines.append(text(b['text']))
            elif set(b)=={'table'} and isinstance(b['table'],list) and 0<len(b['table'])<=100:
                width=len(b['table'][0])
                if not 0<width<=10 or any(not isinstance(r,list) or len(r)!=width for r in b['table']):raise ValueError('TABLE')
                for row in b['table']:lines.append('\t'.join(text(v) for v in row))
            else:raise ValueError('BLOCK')
    elif fmt=='xlsx':
        if set(d)-{'title','accent','sheets'} or not isinstance(d.get('sheets'),list) or not 0<len(d['sheets'])<=20:raise ValueError('DESIGN')
        names=set();lines=[];count=0
        for s in d['sheets']:
            if not isinstance(s,dict) or set(s)-{'name','rows','widths','headerRows'} or not isinstance(s.get('name'),str) or not 0<len(s['name'])<=31 or re.search(r'[\\/*?:\[\]]',s['name']) or s['name'] in names:raise ValueError('SHEET')
            names.add(s['name']);rows=s.get('rows')
            if not isinstance(rows,list) or not 0<len(rows)<=1000 or any(not isinstance(r,list) or len(r)>26 for r in rows):raise ValueError('ROWS')
            count+=sum(len(r) for r in rows)
            if count>10000:raise ValueError('CELLS')
            if not isinstance(s.get('widths',[]),list) or len(s.get('widths',[]))>26 or any(type(v) not in (int,float) or not 4<=v<=100 for v in s.get('widths',[])):raise ValueError('WIDTHS')
            if type(s.get('headerRows',1)) is not int or not 0<=s.get('headerRows',1)<=min(5,len(rows)):raise ValueError('HEADERS')
            lines.append(s['name'])
            for r in rows:
                for v in r:
                    if isinstance(v,str):text(v)
                    elif type(v) not in (float,int) or not __import__('math').isfinite(v):raise ValueError('CELL')
                lines.append('\t'.join(map(str,r)))
    else:raise ValueError('FORMAT')
    projection='\n'.join(lines)
    if len(projection)>60000:raise ValueError('TEXT_LIMIT')
    return projection,accent

def render(d,fmt,base_xlsx):
    projection,accent=validate(d,fmt)
    if fmt=='docx':
        from docx import Document
        from docx.shared import Pt,RGBColor,Inches
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn
        doc=Document();normal=doc.styles['Normal'];normal.font.name='Calibri';normal.font.size=Pt(11)
        for name in ('Title','Heading 1','Heading 2'):doc.styles[name].font.color.rgb=RGBColor.from_string(accent)
        for section in doc.sections:section.top_margin=Inches(.7);section.bottom_margin=Inches(.7)
        if d.get('title'):doc.add_heading(d['title'],0)
        for b in d['blocks']:
            if 'table' in b:
                table=doc.add_table(rows=0,cols=len(b['table'][0]));table.style='Table Grid'
                for i,row in enumerate(b['table']):
                    cells=table.add_row().cells
                    for cell,value in zip(cells,row):
                        cell.text=value
                        if i==0:
                            shade=OxmlElement('w:shd');shade.set(qn('w:fill'),accent);cell._tc.get_or_add_tcPr().append(shade)
                            for run in cell.paragraphs[0].runs:run.bold=True;run.font.color.rgb=RGBColor(255,255,255)
            else:doc.add_paragraph(b['text'],{'heading1':'Heading 1','heading2':'Heading 2','quote':'Quote','paragraph':'Normal'}[b['style']])
        out=io.BytesIO();doc.save(out);return out.getvalue(),projection
    ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';parts={};sheets=[];rels=[];types=[]
    from defusedxml import ElementTree as ET
    for i,s in enumerate(d['sheets'],1):
        with zipfile.ZipFile(io.BytesIO(base_xlsx({'rows':s['rows']}))) as z:
            if i==1:parts={n:z.read(n) for n in z.namelist() if n!='xl/worksheets/sheet1.xml'}
            xml=z.read('xl/worksheets/sheet1.xml').decode()
        def style_cell(m):
            row=int(re.search(r'\d+',m.group(1)).group());style=1 if row<=s.get('headerRows',1) else (2 if row%2==0 else 0)
            return '<c r="'+m.group(1)+'" s="'+str(style)+'"'
        xml=re.sub(r'<c r="([A-Z]+\d+)"',style_cell,xml)
        widths=''.join(f'<col min="{j}" max="{j}" width="{v}" customWidth="1"/>' for j,v in enumerate(s.get('widths',[]),1))
        extras='<sheetViews><sheetView workbookViewId="0"><pane ySplit="'+str(s.get('headerRows',1))+'" topLeftCell="A'+str(s.get('headerRows',1)+1)+'" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' if s.get('headerRows',1) else ''
        xml=xml.replace('<sheetData>',extras+('<cols>'+widths+'</cols>' if widths else '')+'<sheetData>')
        parts[f'xl/worksheets/sheet{i}.xml']=xml.encode()
        sheets.append(f'<sheet name="{escape(s["name"],{chr(34):"&quot;"})}" sheetId="{i}" r:id="rId{i}"/>')
        rels.append(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>')
        if i>1:types.append(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    parts['xl/workbook.xml']=(f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(sheets)+'</sheets></workbook>').encode()
    parts['xl/_rels/workbook.xml.rels']=('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(rels)+'<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>').encode()
    parts['[Content_Types].xml']=parts['[Content_Types].xml'].replace(b'</Types>',(''.join(types)+'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>').encode())
    parts['xl/styles.xml']=(f'<styleSheet xmlns="{ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF{accent}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"><alignment wrapText="1" vertical="top"/></xf><xf fontId="0" fillId="3" borderId="0" applyFill="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>').encode()
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for name,value in parts.items():z.writestr(name,value)
    return out.getvalue(),projection
