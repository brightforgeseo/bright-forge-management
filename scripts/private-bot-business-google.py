"""Server-only exact-file business transport. Never returns credentials."""
import json, os, pathlib, re, sys, time, urllib.parse, uuid
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import AuthorizedSession

LANES={'personal-google':'bensocialbeesmedia@gmail.com','tenxr-google':'analytics@10xr.com.au'}
def validate(r):
    if not isinstance(r,dict) or set(r)-{'lane','fileId','url','method','body','deadline','dispatchHandshake','projection'}: raise ValueError()
    if 'dispatchHandshake' in r and (r['dispatchHandshake'] is not True or r.get('method')!='POST'): raise ValueError()
    lane=r.get('lane'); fid=r.get('fileId'); method=r.get('method')
    if lane not in LANES or not isinstance(fid,str) or fid=='root' or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}',fid): raise ValueError()
    if method not in ('GET','POST') or not isinstance(r.get('url'),str): raise ValueError()
    u=urllib.parse.urlsplit(r['url'])
    if u.scheme!='https' or u.username or u.password or u.port or u.fragment: raise ValueError()
    if 'projection' in r:
        projections={'businessDocTextV1':'https://docs.googleapis.com/v1/documents/'+fid+'?includeTabsContent=true','businessWorkbookV1':'https://www.googleapis.com/drive/v3/files/'+fid+'?alt=media&supportsAllDrives=true'}
        if r['projection'] not in projections or set(r)!={'lane','fileId','method','url','projection'} or method!='GET' or r['url']!=projections[r['projection']]: raise ValueError()
    # Typed company directory transport: one exact parent, bounded page only.
    directory_fields='id,name,mimeType,parents,driveId,trashed,owners(emailAddress),capabilities(canListChildren,canDownload),size,version'
    if u.hostname=='www.googleapis.com' and u.path=='/drive/v3/files':
        q=urllib.parse.parse_qs(u.query,keep_blank_values=True)
        expected={'q':["'"+fid+"' in parents and trashed = false"],'supportsAllDrives':['true'],'includeItemsFromAllDrives':['true'],'pageSize':['50'],'fields':['nextPageToken,files('+directory_fields+')']}
        if method!='GET' or 'body' in r or set(q)-set(expected)-{'pageToken'} or any(q.get(k)!=v for k,v in expected.items()) or 'pageToken' in q and (len(q['pageToken'])!=1 or not 0<len(q['pageToken'][0])<=4096):raise ValueError()
        return lane,fid,method
    if u.hostname=='www.googleapis.com' and u.path=='/drive/v3/files/'+fid+'/export':
        q=urllib.parse.parse_qs(u.query)
        if method!='GET' or 'body' in r or set(q)!={'mimeType'} or q['mimeType'] not in (['application/pdf'],['application/vnd.openxmlformats-officedocument.wordprocessingml.document']):raise ValueError()
        return lane,fid,method
    if u.hostname=='www.googleapis.com' and u.path=='/drive/v3/files/'+fid and urllib.parse.parse_qs(u.query)=={'alt':['media'],'supportsAllDrives':['true']}:
        if method!='GET' or 'body' in r:raise ValueError()
        return lane,fid,method
    create=u.hostname=='www.googleapis.com' and u.path=='/upload/drive/v3/files'
    if create:
        if method!='POST' or urllib.parse.parse_qs(u.query)!={'uploadType':['multipart'],'supportsAllDrives':['true'],'fields':['id,mimeType,parents']}: raise ValueError()
        if type(r.get('deadline')) is not int or not 0 < r['deadline']-time.time()*1000 <= 30000: raise ValueError()
        b=json.loads(r.get('body',''))
        if set(b) not in ({'name','mimeType','parents','appProperties','content'},{'name','mimeType','parents','appProperties','content','mediaBase64','mediaMime'}) or b['parents']!=[fid] or b['mimeType'] not in ('application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet'): raise ValueError()
        if 'mediaBase64' in b:
            import base64
            media=base64.b64decode(b['mediaBase64'],validate=True)
            expected='application/vnd.openxmlformats-officedocument.'+('spreadsheetml.sheet' if b['mimeType'].endswith('spreadsheet') else 'wordprocessingml.document')
            if len(media)>120000 or not media.startswith(b'PK') or b['mediaMime']!=expected:raise ValueError()
            import importlib.util
            spec=importlib.util.spec_from_file_location('formats',pathlib.Path(__file__).with_name('private-bot-formats.py'));codec=importlib.util.module_from_spec(spec);spec.loader.exec_module(codec);codec.package(media)
        if not isinstance(b['name'],str) or not 0 < len(b['name']) <= 200 or not isinstance(b['content'],str) or len(b['content'])>60000: raise ValueError()
        if set(b['appProperties'])!={'privateBotOperation'} or not re.fullmatch('[0-9a-f]{64}',b['appProperties']['privateBotOperation']): raise ValueError()
        return lane,fid,method
    bases={'www.googleapis.com':'/drive/v3/files/'+fid,'docs.googleapis.com':'/v1/documents/'+fid,'sheets.googleapis.com':'/v4/spreadsheets/'+fid}
    base=bases.get(u.hostname)
    if not base: raise ValueError()
    suffix=u.path.removeprefix(base) if u.path.startswith(base) else None
    if suffix is None: raise ValueError()
    if method=='GET':
        if 'body' in r: raise ValueError()
        if suffix not in ('','/permissions') and not (u.hostname=='sheets.googleapis.com' and suffix.startswith('/values/')): raise ValueError()
        if suffix=='/permissions' and u.hostname!='www.googleapis.com': raise ValueError()
        allowed={'fields','supportsAllDrives','pageSize','pageToken'} if u.hostname=='www.googleapis.com' else {'includeTabsContent','fields'} if u.hostname=='docs.googleapis.com' else {'includeGridData','fields','valueRenderOption','dateTimeRenderOption','ranges'}
        query=urllib.parse.parse_qs(u.query,keep_blank_values=True)
        if set(query)-allowed: raise ValueError()
        if u.hostname=='sheets.googleapis.com':
            if any(len(v)!=1 or not v[0] for v in query.values()): raise ValueError()
            native_fields='spreadsheetId,sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,formattedValue,effectiveFormat(backgroundColor,backgroundColorStyle),hyperlink,textFormatRuns,chipRuns))))'
            rich_fields=native_fields.replace('userEnteredValue,formattedValue','userEnteredValue,userEnteredFormat,note,formattedValue')
            visibility_fields='spreadsheetId,sheets(properties(sheetId,title,hidden,gridProperties),data(startRow,startColumn,rowMetadata(hiddenByUser,hiddenByFilter),columnMetadata(hiddenByUser,hiddenByFilter)))'
            if 'ranges' in query or query.get('fields') in ([native_fields],[rich_fields],[visibility_fields]):
                if suffix or set(query)!={'includeGridData','fields','ranges'} or query['includeGridData']!=['true'] or query['fields'] not in ([native_fields],[rich_fields],[visibility_fields]): raise ValueError()
                m=re.fullmatch(r"(?:'(?:[^'\r\n]|'')+'|[A-Za-z0-9_ ]+)!([A-Z]{1,2})([1-9][0-9]{0,3}):([A-Z]{1,2})([1-9][0-9]{0,3})",query['ranges'][0])
                if not m: raise ValueError()
                def column(s):
                    n=0
                    for c in s: n=n*26+ord(c)-64
                    return n
                c1,r1,c2,r2=column(m[1]),int(m[2]),column(m[3]),int(m[4])
                if r2<r1 or c2<c1 or (r2-r1+1)*(c2-c1+1)>10000: raise ValueError()
            elif not suffix:
                # Preserve the exact pre-existing native-write snapshot only.
                # New read projections cannot add fields to or widen this route.
                metadata={'includeGridData':['false'],'fields':['spreadsheetId,sheets(properties(sheetId,title,index,gridProperties,hidden))']}
                if query not in ({'includeGridData':['true']},metadata): raise ValueError()
    else:
        if type(r.get('deadline')) is not int or not 0 < r['deadline']-time.time()*1000 <= 30000: raise ValueError()
        if suffix!=':batchUpdate' or u.query or u.hostname=='www.googleapis.com': raise ValueError()
        body=json.loads(r.get('body',''))
        if not isinstance(body,dict) or set(body)-{'requests','writeControl'} or not isinstance(body.get('requests'),list) or not 1 <= len(body['requests']) <= 500: raise ValueError()
        if u.hostname=='docs.googleapis.com':
            if set(body)!= {'requests','writeControl'} or set(body['writeControl'])!={'requiredRevisionId'}: raise ValueError()
            for request in body['requests']:
                if set(request) not in ({'replaceAllText'},{'deleteContentRange'},{'insertText'},{'updateTextStyle'}): raise ValueError()
                if 'updateTextStyle' in request:
                    s=request['updateTextStyle']
                    allowed={'bold','italic','underline','strikethrough','fontSize','weightedFontFamily','foregroundColor','backgroundColor','link','baselineOffset'}
                    if not isinstance(s,dict) or set(s)!={'range','textStyle','fields'} or not isinstance(s['textStyle'],dict) or set(s['textStyle'])-allowed or set(s['fields'].split(','))-allowed: raise ValueError()
                    g=s['range']
                    if set(g)!={'tabId','startIndex','endIndex'} or not isinstance(g['tabId'],str) or not all(type(g[k]) is int for k in ('startIndex','endIndex')) or not 1<=g['startIndex']<g['endIndex']:raise ValueError()
                    if 'link' in s['textStyle']:
                        link=urllib.parse.urlsplit(s['textStyle']['link'].get('url',''))
                        if link.scheme not in ('https','http') or not link.hostname or link.username or link.password:raise ValueError()
            if len(body['requests'])>300: raise ValueError()
        else:
            if set(body)!={'requests'}: raise ValueError()
            for request in body['requests']:
                if set(request)=={'findReplace'}: continue
                if set(request)!={'updateCells'}: raise ValueError()
                u=request['updateCells']
                if not isinstance(u,dict) or set(u)!={'range','rows','fields'} or u['fields'] not in ('userEnteredValue','userEnteredValue,userEnteredFormat,textFormatRuns,note'): raise ValueError()
                g=u['range']; keys={'sheetId','startRowIndex','endRowIndex','startColumnIndex','endColumnIndex'}
                if not isinstance(g,dict) or set(g)!=keys or any(type(v) is not int or v<0 for v in g.values()): raise ValueError()
                height=g['endRowIndex']-g['startRowIndex']; width=g['endColumnIndex']-g['startColumnIndex']
                if not 0<height<=100 or not 0<width<=26 or height*width>500 or not isinstance(u['rows'],list) or len(u['rows'])!=height: raise ValueError()
                for row in u['rows']:
                    if not isinstance(row,dict) or set(row)!={'values'} or not isinstance(row['values'],list) or len(row['values'])!=width: raise ValueError()
                    for cell in row['values']:
                        if not isinstance(cell,dict) or set(cell)-set(u['fields'].split(',')): raise ValueError()
                        if 'userEnteredFormat' in cell and (not isinstance(cell['userEnteredFormat'],dict) or set(cell['userEnteredFormat'])-{'backgroundColor','backgroundColorStyle','textFormat','numberFormat','horizontalAlignment','verticalAlignment','wrapStrategy','textRotation','padding','borders','hyperlinkDisplayType'}):raise ValueError()
                        if 'textFormatRuns' in cell and (not isinstance(cell['textFormatRuns'],list) or len(cell['textFormatRuns'])>100):raise ValueError()
                        if 'note' in cell and (not isinstance(cell['note'],str) or len(cell['note'])>10000):raise ValueError()
                        v=cell.get('userEnteredValue',{})
                        if not isinstance(v,dict) or len(v)>1 or set(v)-{'stringValue','numberValue','boolValue','formulaValue'}: raise ValueError()
                        for k,x in v.items():
                            if k=='numberValue' and (type(x) not in (int,float) or not __import__('math').isfinite(x)): raise ValueError()
                            if k=='boolValue' and type(x) is not bool: raise ValueError()
                            if k in ('stringValue','formulaValue') and (not isinstance(x,str) or len(x)>10000): raise ValueError()
                            if k=='formulaValue' and not x.startswith('='): raise ValueError()
    return lane,fid,method

DOC_WIRE_LIMIT=4*1024*1024
DOC_TEXT_LIMIT=100000

def bounded_doc_wire(response):
    chunks=[];size=0;started=time.monotonic()
    for chunk in response.iter_content(chunk_size=65536):
        size+=len(chunk)
        if size>DOC_WIRE_LIMIT or time.monotonic()-started>15: raise ValueError()
        chunks.append(chunk)
    return b''.join(chunks)

def project_business_doc(document,fid,wire_bytes=None):
    # Complete literal text only, NOT rendered/pixel fidelity. AutoText PAGE_NUMBER
    # and PAGE_COUNT have no literal rendered value in the Docs API. Record their
    # type and UTF-16 offset separately, never invent page values or drop silently.
    # https://developers.google.com/workspace/docs/api/reference/rest/v1/documents#AutoText
    # The full source stays inside this credential-owning
    # helper; the SAME shared classifier checks it before discarded styles can hide
    # a credential URL. No field mask, global cap increase or caller source control.
    import subprocess
    if not isinstance(document,dict) or document.get('documentId')!=fid: raise ValueError()
    parts=[];chars=0;nodes=0;consumed=set();found=set();content_strings=set();started=time.monotonic()
    autogenerated=[];auto_found=set();auto_consumed=set();offset_utf16=0
    def walk(v,depth=0):
        nonlocal nodes,chars,offset_utf16
        nodes+=1
        if depth>40 or nodes>200000 or time.monotonic()-started>2: raise ValueError()
        if isinstance(v,list):
            for x in v:walk(x,depth+1)
        elif isinstance(v,dict):
            if 'text' in v:raise ValueError()
            if isinstance(v.get('content'),str):content_strings.add(id(v))
            if any(k.startswith('suggested') for k in v):raise ValueError('DOC_SUGGESTED_UNSUPPORTED')
            if 'autoText' in v:auto_found.add(id(v['autoText']))
            if 'textRun' in v:
                if not isinstance(v['textRun'],dict) or not isinstance(v['textRun'].get('content'),str):raise ValueError()
                found.add(id(v['textRun']))
            if 'content' in v and isinstance(v['content'],list):
                for e in v['content']:
                    if not isinstance(e,dict) or len(set(e)&{'paragraph','table','tableOfContents','sectionBreak'})!=1 or set(e)-{'startIndex','endIndex','paragraph','table','tableOfContents','sectionBreak'}:raise ValueError()
            if 'paragraph' in v:
                p=v['paragraph']
                if not isinstance(p,dict) or not isinstance(p.get('elements'),list):raise ValueError()
                runs=[]
                for e in p['elements']:
                    if not isinstance(e,dict):raise ValueError()
                    kinds=set(e)-{'startIndex','endIndex'}
                    if len(kinds)!=1 or not kinds<= {'textRun','autoText','inlineObjectElement','footnoteReference','pageBreak','columnBreak','horizontalRule'}:raise ValueError('DOC_ELEMENT_UNSUPPORTED')
                    if 'autoText' in e:
                        a=e['autoText']
                        if not isinstance(a,dict) or set(a)-{'type','textStyle'} or a.get('type') not in ('PAGE_NUMBER','PAGE_COUNT') or ('textStyle' in a and not isinstance(a['textStyle'],dict)):raise ValueError('DOC_AUTOTEXT_UNSUPPORTED')
                        if any(type(e[k]) is not int or e[k]<0 for k in ('startIndex','endIndex') if k in e) or ('startIndex' in e and 'endIndex' in e and e['endIndex']<=e['startIndex']):raise ValueError('DOC_AUTOTEXT_MALFORMED')
                        if len(autogenerated)>=1024:raise ValueError('DOC_AUTOTEXT_LIMIT')
                        autogenerated.append({'type':a['type'],'offsetUtf16':offset_utf16,'renderedTextAvailable':False})
                        auto_consumed.add(id(a))
                    if 'textRun' in e:
                        t=e['textRun'].get('content')
                        if not isinstance(t,str):raise ValueError()
                        runs.append(t);consumed.add(id(e['textRun']));offset_utf16+=len(t.encode('utf-16-le'))//2
                text=''.join(runs);chars+=len(text)+1
                if chars>DOC_TEXT_LIMIT:raise ValueError()
                parts.append(text)
            for x in v.values():walk(x,depth+1)
        elif v is not None and not isinstance(v,(str,int,float,bool)):raise ValueError()
    walk(document)
    if found!=consumed or content_strings!=consumed or auto_found!=auto_consumed:raise ValueError('DOC_LITERAL_COVERAGE')
    text=''.join(parts)
    # Preserve all paragraph/table/tab/header/footer/footnote text, never truncate.
    payload=json.dumps([document,{'businessText':text}],ensure_ascii=False,separators=(',',':')).encode()
    if len(payload)>DOC_WIRE_LIMIT+DOC_TEXT_LIMIT:raise ValueError()
    script="const fs=require('node:fs');try{const v=JSON.parse(fs.readFileSync(0,'utf8'));require('./private-bot-business-classification.cjs').safeText(v);process.stdout.write('OK')}catch{process.exitCode=1}"
    try:checked=subprocess.run(['node','-e',script],input=payload,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,cwd=pathlib.Path(__file__).parent,timeout=2)
    except subprocess.TimeoutExpired:raise ValueError('DOC_CLASSIFIER_TIMEOUT') from None
    if checked.returncode or checked.stdout!=b'OK':raise ValueError('DOC_CLASSIFIER_DENIED')
    result={'documentId':fid,'representation':'businessDocTextV1','businessText':text,'complete':True,'literalTextComplete':True,'renderedTextComplete':False,'autogeneratedFields':autogenerated,'wireBytes':wire_bytes or len(json.dumps(document,separators=(',',':')).encode())}
    # ASCII JSON byte bound is stricter than both existing output/channel limits.
    if len(json.dumps(result).encode())>DOC_TEXT_LIMIT:raise ValueError()
    return result

def profile_token_path(lane):
    if lane not in LANES:raise ValueError('INVALID_GOOGLE_LANE')
    root=pathlib.Path(os.environ.get('HERMES_HOME') or pathlib.Path.home()/'.hermes').expanduser()
    if not root.is_absolute():raise ValueError('INVALID_GOOGLE_PROFILE_HOME')
    return root/'profiles'/lane/'google_token.json'

def execute(r):
    lane,fid,method=validate(r)
    p=profile_token_path(lane)
    if p.is_symlink() or p.stat().st_uid!=os.getuid() or p.stat().st_mode & 0o077: raise ValueError()
    credentials=Credentials.from_authorized_user_info(json.loads(p.read_text()))
    with AuthorizedSession(credentials,max_refresh_attempts=0) as session:
        identity=session.get('https://www.googleapis.com/drive/v3/about',params={'fields':'user(emailAddress)'},timeout=15,allow_redirects=False)
        if identity.status_code!=200 or identity.json().get('user',{}).get('emailAddress')!=LANES[lane]: raise ValueError()
        # Bounded retries only for read-only transient endpoints. Never replay writes.
        attempts=2 if method=='GET' else 1
        data=r.get('body'); content_type='application/json'
        if urllib.parse.urlsplit(r['url']).path=='/upload/drive/v3/files':
            metadata=json.loads(data); content=metadata.pop('content'); boundary='privatebot'+uuid.uuid4().hex
            content_type='multipart/related; boundary='+boundary
            source_type=metadata.pop('mediaMime','text/csv' if metadata['mimeType'].endswith('spreadsheet') else 'text/plain')
            media=__import__('base64').b64decode(metadata.pop('mediaBase64'),validate=True) if 'mediaBase64' in metadata else content.encode('utf-8')
            data=(f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+json.dumps(metadata)+f'\r\n--{boundary}\r\nContent-Type: {source_type}\r\n\r\n').encode('utf-8')+media+f'\r\n--{boundary}--'.encode('utf-8')
        # Google pretty-prints JSON by default. The bounded transport limit is
        # for useful content, not whitespace: ask for compact wire JSON without
        # widening fields/ranges or increasing either process/content byte cap.
        request_url=r['url']
        if method=='GET':
            request_url += ('&' if urllib.parse.urlsplit(request_url).query else '?')+'prettyPrint=false'
        # Parent rechecks live requester/job/lease/source/account/target authority
        # after the asynchronous identity check, immediately before dispatch.
        if r.get('dispatchHandshake'):
            sys.stdout.write('{"dispatchReady":true}\n');sys.stdout.flush()
            answer=sys.stdin.buffer.readline(1024)
            if answer!=b'{"dispatchAllowed":true}\n': raise ValueError()
        for attempt in range(attempts):
            remaining=(r['deadline']/1000-time.time()) if method=='POST' else 15
            if remaining<=0: raise ValueError()
            request_sent_at=time.time()*1000
            response=session.request(method,request_url,data=data,headers={'Content-Type':content_type},timeout=min(15,remaining),allow_redirects=False,**({'stream':True} if r.get('projection') else {}))
            response_completed_at=time.time()*1000
            if response.status_code not in (429,500,502,503,504) or attempt+1==attempts: break
            if r.get('projection'):response.close()
            time.sleep(.3)
        if r.get('projection'):
            try:
                expected_mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' if r['projection']=='businessWorkbookV1' else 'application/json'
                if response.status_code!=200 or response.headers.get('Content-Type','').split(';')[0]!=expected_mime:raise ValueError()
                raw=bounded_doc_wire(response)
                if r['projection']=='businessWorkbookV1':
                    if len(raw)>2*1024*1024:raise ValueError('WORKBOOK_LIMIT')
                    import importlib.util
                    spec=importlib.util.spec_from_file_location('workbook_codec',pathlib.Path(__file__).with_name('private-bot-formats.py'));codec=importlib.util.module_from_spec(spec);spec.loader.exec_module(codec)
                    value=codec.read_xlsx(raw,business=True)
                    value.update(fileId=fid,representation='businessWorkbookV1')
                    if len(json.dumps(value).encode())>160000:raise ValueError('WORKBOOK_OUTPUT_LIMIT')
                else:value=project_business_doc(json.loads(raw),fid,len(raw))
                response_completed_at=time.time()*1000
            finally:response.close()
            return {'value':value,'providerEvidence':{'requestSentAt':request_sent_at,'responseCompletedAt':response_completed_at,'providerDate':response.headers.get('Date'),'status':response.status_code,'account':LANES[lane],'method':method,'url':r['url']}}
        if response.status_code!=200 or len(response.content)>250000: raise ValueError()
        binary=urllib.parse.parse_qs(urllib.parse.urlsplit(r['url']).query).get('alt')==['media'] or urllib.parse.urlsplit(r['url']).path.endswith('/export')
        if binary:
            if len(response.content)>120000:raise ValueError()
            mime=response.headers.get('Content-Type','').split(';')[0]
            if mime not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'):raise ValueError()
            value={'bytesBase64':__import__('base64').b64encode(response.content).decode('ascii'),'mimeType':mime}
        else:value=response.json()
        return {'value':value,'providerEvidence':{'requestSentAt':request_sent_at,'responseCompletedAt':response_completed_at,'providerDate':response.headers.get('Date'),'status':response.status_code,'account':LANES[lane],'method':method,'url':r['url']}}

if __name__=='__main__':
    try:
        raw=sys.stdin.buffer.readline(200001)
        if len(raw)>200000: raise ValueError()
        result=execute(json.loads(raw))
        sys.stdout.write(json.dumps(result))
    except Exception:
        sys.stdout.write('{"error":"GOOGLE_BUSINESS_SERVICE_UNAVAILABLE"}')
        sys.exit(1)
