"""Typed, read-only Issues report projection, not arbitrary Google-file access.
Protected role/account policy plus live file ownership and exact report semantics.
Other workbook tabs/cells, formulas and raw metadata never leave this adapter.
"""
import json,os,re,hashlib,pathlib,urllib.parse
LANES={'personal-google':'bensocialbeesmedia@gmail.com','tenxr-google':'analytics@10xr.com.au'}
def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def load():
 p=pathlib.Path.home()/'state/private-bot-grants/business-report-readers.json';st=p.lstat()
 if p.is_symlink() or not p.is_file() or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('REPORT_POLICY_INVALID')
 return json.loads(p.read_text())
def public_evidence_link(value):
 if not isinstance(value,str) or len(value)>=2048:return False
 try:
  u=urllib.parse.urlsplit(value)
  if u.scheme!='https' or not u.hostname or u.username or u.password:return False
  # Withhold the whole credential-bearing reference, never emit a secret or
  # turn its destination into a new fetch grant. Normal query/gid anchors stay.
  sensitive={'accesstoken','refreshtoken','idtoken','token','apikey','key','secret','clientsecret','password','passwd','pwd','authorization','auth','bearer','credential','credentials','signature','sig','code','session','sessionid','sessiontoken','securitytoken'}
  for part in (u.query,u.fragment,u.fragment.partition('?')[2]):
   for key,_ in urllib.parse.parse_qsl(part.replace(';','&'),keep_blank_values=True):
    key=re.sub('[^a-z0-9]','',urllib.parse.unquote(key).lower())
    if key in sensitive or key.endswith(('token','secret','password','signature','credential')):return False
  return True
 except ValueError:return False

def execute(request,policy_override=None,session_factory=None):
 a=request.get('arguments',{});p=load() if policy_override is None else policy_override
 if request.get('operation')!='business_report_read' or set(a)-{'fileId','sheetId','policy_sha256'} or not re.fullmatch('[A-Za-z0-9_-]{20,200}',a.get('fileId','')) or a.get('policy_sha256')!=digest(p) or p.get('version')!=1 or p.get('reportTypes')!=['screaming-frog-issues-v1']:raise ValueError('REPORT_SCOPE_DENIED')
 fid=a['fileId'];errors=[]
 for lane in p['lanes']:
  if lane not in LANES:raise ValueError('REPORT_POLICY_INVALID')
  if session_factory:s=session_factory(lane)
  else:
   from google.oauth2.credentials import Credentials
   from google.auth.transport.requests import AuthorizedSession
   token=pathlib.Path.home()/'.hermes/profiles'/lane/'google_token.json';st=token.lstat()
   if token.is_symlink() or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('REPORT_ACCOUNT_UNAVAILABLE')
   s=AuthorizedSession(Credentials.from_authorized_user_info(json.loads(token.read_text())),max_refresh_attempts=0)
  def get(url,params={}):
   r=s.get(url,params=params,timeout=20,allow_redirects=False)
   if r.status_code!=200 or len(r.content)>160000:raise ValueError('REPORT_READ_UNAVAILABLE')
   return r.json()
  try:
   identity=get('https://www.googleapis.com/drive/v3/about',{'fields':'user(emailAddress)'})
   if identity.get('user',{}).get('emailAddress')!=LANES[lane]:raise ValueError('REPORT_ACCOUNT_MISMATCH')
   def meta():return get('https://www.googleapis.com/drive/v3/files/'+fid,{'supportsAllDrives':'true','fields':'id,name,mimeType,owners(emailAddress),trashed,version'})
   m=meta()
   # Accessible alone is not sufficient. Require independently owned business
   # source in the selected protected account; arbitrary third-party URLs fail.
   if m.get('id')!=fid or m.get('mimeType')!='application/vnd.google-apps.spreadsheet' or m.get('trashed') or [x.get('emailAddress') for x in m.get('owners',[])]!=[LANES[lane]] or re.search('credential|password|private|bank|payroll|finance|invoice|loan',m.get('name',''),re.I):raise ValueError('REPORT_SOURCE_AUTHORITY_REQUIRED')
   native=get('https://sheets.googleapis.com/v4/spreadsheets/'+fid,{'includeGridData':'false','fields':'spreadsheetId,sheets(properties(sheetId,title,gridProperties,hidden))'})
   tabs=[x['properties'] for x in native.get('sheets',[]) if x['properties'].get('title')=='Screaming Frog Issues' and not x['properties'].get('hidden') and (not a.get('sheetId') or str(x['properties']['sheetId'])==a['sheetId'])]
   if len(tabs)!=1:raise ValueError('REPORT_TAB_REQUIRED')
   tab=tabs[0];grid=tab['gridProperties'];end=grid['rowCount']
   if grid['columnCount']!=6 or not 2<=end<=1000:raise ValueError('REPORT_SHAPE_UNSUPPORTED')
   range_="'Screaming Frog Issues'!A1:F"+str(end)
   body=get('https://sheets.googleapis.com/v4/spreadsheets/'+fid,{'ranges':range_,'includeGridData':'true','fields':'spreadsheetId,sheets(properties(sheetId),data(startRow,startColumn,rowData(values(effectiveValue,hyperlink,textFormatRuns))))'})
   if body.get('spreadsheetId')!=fid or len(body.get('sheets',[]))!=1 or body['sheets'][0]['properties']['sheetId']!=tab['sheetId']:raise ValueError('REPORT_TAB_MISMATCH')
   data=body['sheets'][0]['data'];rows=[]
   for block in data:
    if block.get('startRow',0)!=0 or block.get('startColumn',0)!=0:raise ValueError('REPORT_SHAPE_UNSUPPORTED')
    rows.extend(block.get('rowData',[]))
   def values(row):return [c.get('effectiveValue',{}).get('stringValue',c.get('effectiveValue',{}).get('numberValue','')) for c in row.get('values',[])]
   header=['Issue Name','Issue Type','Issue Priority','URLs','Links','Status'];hi=next((i for i,r in enumerate(rows[:2]) if values(r)==header),None)
   if hi is None:raise ValueError('REPORT_SCHEMA_UNSUPPORTED')
   items=[]
   for i,row in enumerate(rows[hi+1:],hi+2):
    v=values(row)
    if not any(x!='' for x in v):continue
    if len(v)!=6 or not isinstance(v[0],str) or len(v[0])>180 or not re.fullmatch(r'(Security|Page Titles|Meta Description|H1|H2|Images|Links|Response Codes|Canonicals|Directives|Content|Pagination|Hreflang|URLs): [A-Za-z0-9 ()<>/.,%–-]+',v[0]) or v[1] not in ['Issue','Warning','Opportunity'] or v[2] not in ['High','Medium','Low'] or type(v[3]) not in (int,float) or v[3]<0 or int(v[3])!=v[3] or v[4] not in ['Link',''] or v[5] not in ['Fail','Pass','Fixed','Pending','']:raise ValueError('REPORT_SENSITIVE_OR_UNSUPPORTED_CONTENT')
    cell=row['values'][4];links=[cell.get('hyperlink')]+[t.get('format',{}).get('link',{}).get('uri') for t in cell.get('textFormatRuns',[])]
    links=[u for u in links if public_evidence_link(u)]
    items.append({'sheetRow':i,'issue':v[0],'type':v[1],'priority':v[2],'affectedUrls':int(v[3]),'status':v[5],'evidenceLinks':sorted(set(links))})
   if meta()!=m:raise ValueError('REPORT_SOURCE_CHANGED')
   if policy_override is None and digest(load())!=a['policy_sha256']:raise ValueError('REPORT_POLICY_CHANGED')
   return {'provider':'Google Sheets','accountLane':lane,'fileId':fid,'clientLabel':m['name'],'clientLabelSource':'live business-owned report title, not a verified website/domain','dataClass':'business-technical-issues-report','sheetId':tab['sheetId'],'range':range_,'issues':items,'issueCount':len(items),'contentReadback':True,'readOnly':True,'limitation':'Issue summary, not crawl-level URL evidence, speed measurements, traffic or ranking performance. Counts overlap; do not sum into unique affected URLs. Evidence links are references, not new source grants.'}
  except ValueError as e:
   errors.append(str(e))
   if str(e) not in ['REPORT_READ_UNAVAILABLE','REPORT_SOURCE_AUTHORITY_REQUIRED']:raise
  finally:s.close()
 raise ValueError('REPORT_SOURCE_AUTHORITY_REQUIRED')
