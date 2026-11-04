"""Read-only business client adapters. Invoked only by the existing connector.
No caller URLs, arbitrary software execution, credentials in output, or paid tasks.
"""
import datetime,hashlib,json,pathlib,re,os,urllib.parse
LANES={'personal-google':'bensocialbeesmedia@gmail.com','tenxr-google':'analytics@10xr.com.au'}
def digest(value):
 return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def load():
 p=pathlib.Path.home()/'state/private-bot-grants/business-clients.json'
 st=p.lstat()
 if p.is_symlink() or not p.is_file() or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('BUSINESS_CLIENT_POLICY_INVALID')
 d=json.loads(p.read_text())
 if d.get('version')!=1 or not isinstance(d.get('clients'),list):raise ValueError('BUSINESS_CLIENT_POLICY_INVALID')
 return d['clients']
def validate(s):
 if not isinstance(s,dict) or s.get('lane') not in LANES:raise ValueError('BUSINESS_CLIENT_POLICY_INVALID')
 if not isinstance(s,dict) or set(s)-{'id','name','host','lane','accountEmail','boardId','authority','gscProperty','roots','ga4','seranking','cms','accessClass'}:raise ValueError('BUSINESS_CLIENT_POLICY_INVALID')
 if s.get('host') is None and (not s.get('roots') or any(s.get(k) for k in ('gscProperty','ga4','cms','seranking'))) or s.get('accessClass') not in (None,'registered-staff'):raise ValueError('BUSINESS_CLIENT_POLICY_INVALID')
 if not re.fullmatch('[a-z0-9][a-z0-9-]{0,79}',s.get('id','')) or (s.get('host') is not None and not re.fullmatch(r'([a-z0-9-]+\.)+[a-z]{2,}',s['host'])) or s.get('accountEmail')!=LANES.get(s.get('lane')) or s.get('authority',{}).get('kind')!='business-registry' or not s.get('authority',{}).get('evidence') or not isinstance(s.get('roots'),list):raise ValueError('BUSINESS_CLIENT_POLICY_INVALID')
 p=s.get('gscProperty')
 if p is not None:
  u=urllib.parse.urlsplit(p)
  if p!='sc-domain:'+s['host'] and not (u.scheme in ('http','https') and not u.username and not u.password and not u.port and not u.query and not u.fragment and u.path=='/' and u.hostname.removeprefix('www.')==s['host']):raise ValueError('BUSINESS_CLIENT_POLICY_INVALID')
 return s

def execute(request,scope_override=None,session_factory=None):
 op=request.get('operation');a=request.get('arguments',{})
 fields={'client_gsc_read':{'site','start_date','end_date','query'},'client_ga4_read':{'site','start_date','end_date'},'client_drive_discovery':{'root','page_token'},'client_doc_read':{'root','fileId'},'client_seranking_read':{'kind','start_date','end_date','offset'},'client_cms_read':{'kind','page'}}
 if op not in fields or not isinstance(a,dict) or set(a)-(fields[op]|{'client','scope_sha256'}) or any(not isinstance(v,str) or len(v)>500 for v in a.values()):raise ValueError('BUSINESS_CLIENT_ARGUMENTS_DENIED')
 matches=[s for s in (load() if scope_override is None else scope_override) if s.get('id')==a.get('client')]
 if len(matches)!=1:raise ValueError('BUSINESS_CLIENT_SCOPE_DENIED')
 s=validate(matches[0]);expected=digest(s)
 if a.get('scope_sha256')!=expected:raise ValueError('BUSINESS_CLIENT_SCOPE_CHANGED')
 def final_policy():
  if scope_override is None:
   fresh=[x for x in load() if x.get('id')==s['id']]
   if len(fresh)!=1 or digest(fresh[0])!=expected:raise ValueError('BUSINESS_CLIENT_SCOPE_CHANGED')
 if op in ('client_seranking_read','client_cms_read'):
  import importlib.util
  spec=importlib.util.spec_from_file_location('client_software',pathlib.Path(__file__).with_name('private-bot-client-software.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  value=module.execute(op,a,s);final_policy();return value
 if op in ('client_gsc_read','client_ga4_read'):
  if not s.get('gscProperty' if op=='client_gsc_read' else 'ga4') or a.get('site')!=s['id']:raise ValueError('BUSINESS_ANALYTICS_SCOPE_REQUIRED')
  start=datetime.date.fromisoformat(a['start_date']);end=datetime.date.fromisoformat(a['end_date'])
  if str(start)!=a['start_date'] or str(end)!=a['end_date'] or not 0<=(end-start).days<=93:raise ValueError('BUSINESS_CLIENT_ARGUMENTS_DENIED')
 else:
  roots=[r for r in s['roots'] if r.get('id')==a.get('root')]
  if len(roots)!=1:raise ValueError('BUSINESS_ROOT_AUTHORITY_REQUIRED')
  root=roots[0]
  if not re.fullmatch('[A-Za-z0-9_-]{20,200}',root['id']) or root.get('authority',{}).get('kind')!='explicit-business-read-root' or not root['authority'].get('evidence') or not isinstance(root.get('parents'),list):raise ValueError('BUSINESS_ROOT_AUTHORITY_REQUIRED')
  if op=='client_doc_read' and ('document' not in root.get('readTypes',[]) or not re.fullmatch('[A-Za-z0-9_-]{20,200}',a.get('fileId',''))):raise ValueError('BUSINESS_ROOT_BODY_AUTHORITY_REQUIRED')
 if session_factory is None:
  from google.oauth2.credentials import Credentials
  from google.auth.transport.requests import AuthorizedSession
  token=pathlib.Path.home()/'.hermes/profiles'/s['lane']/'google_token.json';st=token.lstat()
  if token.is_symlink() or st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('BUSINESS_CREDENTIAL_LANE_UNAVAILABLE')
  session=AuthorizedSession(Credentials.from_authorized_user_info(json.loads(token.read_text())),max_refresh_attempts=0)
 else:session=session_factory()
 def get(url,params=None):
  r=session.get(url,params={**(params or {}),'prettyPrint':'false'},timeout=20,allow_redirects=False)
  if r.status_code!=200 or len(r.content)>120000:raise ValueError('BUSINESS_READ_UNAVAILABLE')
  return r.json()
 try:
  identity=get('https://www.googleapis.com/drive/v3/about',{'fields':'user(emailAddress)'})
  if identity.get('user',{}).get('emailAddress')!=s['accountEmail']:raise ValueError('BUSINESS_ACCOUNT_MISMATCH')
  if op=='client_gsc_read':
   url='https://www.googleapis.com/webmasters/v3/sites/'+urllib.parse.quote(s['gscProperty'],safe='')
   prop=get(url)
   if prop.get('siteUrl')!=s['gscProperty'] or prop.get('permissionLevel') not in ('siteOwner','siteFullUser','siteRestrictedUser'):raise ValueError('BUSINESS_PROPERTY_MISMATCH')
   payload={'startDate':a['start_date'],'endDate':a['end_date'],'type':'web','dataState':'final','rowLimit':1}
   if a.get('query'):payload['dimensionFilterGroups']=[{'filters':[{'dimension':'query','operator':'equals','expression':a['query']}]}]
   r=session.post(url+'/searchAnalytics/query',json=payload,timeout=25,allow_redirects=False)
   if r.status_code!=200 or len(r.content)>120000:raise ValueError('BUSINESS_GSC_READ_UNAVAILABLE')
   value={'provider':'Google Search Console','client':s['id'],'accountLane':s['lane'],'property':s['gscProperty'],'readOnly':True,'request':payload,'data':r.json(),'metricDefinitions':{'clicks':'Google web organic search clicks, not all-channel sessions','position':'Impression-weighted average position, not live SERP rank'}}
  elif op=='client_ga4_read':
   ga=s['ga4'];prop=ga.get('property','');stream=ga.get('stream','')
   if not re.fullmatch('properties/[1-9][0-9]*',prop) or not re.fullmatch(re.escape(prop)+'/dataStreams/[1-9][0-9]*',stream):raise ValueError('BUSINESS_GA4_SCOPE_REQUIRED')
   metadata=get('https://analyticsadmin.googleapis.com/v1beta/'+prop)
   web=get('https://analyticsadmin.googleapis.com/v1beta/'+stream)
   if metadata.get('name')!=prop or metadata.get('timeZone')!=ga.get('timeZone') or web.get('name')!=stream or urllib.parse.urlsplit(web.get('webStreamData',{}).get('defaultUri','')).hostname not in (s['host'],'www.'+s['host']):raise ValueError('BUSINESS_GA4_BINDING_CHANGED')
   payload={'dateRanges':[{'startDate':a['start_date'],'endDate':a['end_date']}],'metrics':[{'name':'sessions'},{'name':'totalUsers'},{'name':'screenPageViews'}],'dimensionFilter':{'filter':{'fieldName':'hostName','inListFilter':{'values':[s['host'],'www.'+s['host']]}}}}
   r=session.post('https://analyticsdata.googleapis.com/v1beta/'+prop+':runReport',json=payload,timeout=25,allow_redirects=False)
   if r.status_code!=200 or len(r.content)>120000:raise ValueError('BUSINESS_GA4_READ_UNAVAILABLE')
   value={'provider':'Google Analytics 4','client':s['id'],'accountLane':s['lane'],'property':prop,'stream':stream,'timeZone':metadata['timeZone'],'currencyCode':metadata.get('currencyCode'),'readOnly':True,'request':payload,'data':r.json(),'metricDefinition':'All-channel sessions, users and page views for exact client hosts. Not organic GSC clicks or evidence of SEO causation.'}
  else:
   meta=get('https://www.googleapis.com/drive/v3/files/'+root['id'],{'supportsAllDrives':'true','fields':'id,name,mimeType,parents,driveId,trashed,capabilities(canListChildren)'})
   if meta.get('id')!=root['id'] or meta.get('name')!=root['name'] or meta.get('mimeType')!='application/vnd.google-apps.folder' or meta.get('trashed') or sorted(meta.get('parents',[]))!=sorted(root['parents']) or meta.get('driveId')!=root.get('driveId') or meta.get('capabilities',{}).get('canListChildren') is not True:raise ValueError('BUSINESS_ROOT_IDENTITY_CHANGED')
   if op=='client_doc_read':
    def child_meta():return get('https://www.googleapis.com/drive/v3/files/'+a['fileId'],{'supportsAllDrives':'true','fields':'id,name,mimeType,parents,driveId,trashed,version'})
    child=child_meta()
    if child.get('id')!=a['fileId'] or child.get('mimeType')!='application/vnd.google-apps.document' or child.get('parents')!=[root['id']] or child.get('driveId')!=root.get('driveId') or child.get('trashed') or re.search('credential|password|private|finance|payroll|bank|internal',child.get('name',''),re.I):raise ValueError('BUSINESS_CHILD_OUT_OF_SCOPE')
    # Read text-bearing structure, not hundreds of KB of presentation styles.
    # At the depth boundary retain whole content, never drop nested body text.
    def content_fields(depth):
     if depth==0:return 'content'
     nested=content_fields(depth-1)
     return 'content(paragraph(elements(textRun(content))),table(tableRows(tableCells('+nested+'))),tableOfContents('+nested+'))'
    fields='documentId,tabs(documentTab(body('+content_fields(3)+')),childTabs)'
    native=get('https://docs.googleapis.com/v1/documents/'+a['fileId'],{'includeTabsContent':'true','fields':fields})
    if native.get('documentId')!=a['fileId']:raise ValueError('BUSINESS_CHILD_OUT_OF_SCOPE')
    def text(x):
     if isinstance(x,list):return ''.join(text(v) for v in x)
     if not isinstance(x,dict):return ''
     if 'textRun' in x:return x['textRun'].get('content','')
     return ''.join(text(v) for k,v in x.items() if k in ('body','content','tabs','documentTab','childTabs','paragraph','elements','table','tableRows','tableCells','tableOfContents'))
    body=text(native)
    if re.search(r'(?:password|api[_ -]?key|secret|refresh_token)\s*[:=]\s*\S{8,}',body,re.I):raise ValueError('BUSINESS_SENSITIVE_CONTENT_HOLD')
    after_root=get('https://www.googleapis.com/drive/v3/files/'+root['id'],{'supportsAllDrives':'true','fields':'id,name,mimeType,parents,driveId,trashed,capabilities(canListChildren)'})
    if child_meta()!=child or after_root!=meta:raise ValueError('BUSINESS_SOURCE_CHANGED')
    final_policy()
    return {'provider':'Google Docs','client':s['id'],'accountLane':s['lane'],'fileId':a['fileId'],'root':root['id'],'name':child['name'],'readOnly':True,'contentReadback':True,'text':body,'limitation':'Native text including tables/tabs; not rendered layout. No edit or publication authority.'}
   mimes=['application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet']
   params={'q':"'"+root['id']+"' in parents and trashed = false and (mimeType = '"+mimes[0]+"' or mimeType = '"+mimes[1]+"')",'fields':'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,driveId,trashed)','pageSize':'50','supportsAllDrives':'true','includeItemsFromAllDrives':'true','orderBy':'name','corpora':'drive' if root.get('driveId') else 'user'}
   if root.get('driveId'):params['driveId']=root['driveId']
   if a.get('page_token'):params['pageToken']=a['page_token']
   data=get('https://www.googleapis.com/drive/v3/files',params);files=data.get('files')
   if data.get('incompleteSearch') or not isinstance(files,list) or len(files)>50:raise ValueError('BUSINESS_DISCOVERY_INCOMPLETE')
   for f in files:
    if root['id'] not in f.get('parents',[]) or f.get('mimeType') not in mimes or f.get('trashed') or f.get('driveId')!=root.get('driveId') or not re.fullmatch('[A-Za-z0-9_-]{20,200}',f.get('id','')):raise ValueError('BUSINESS_CHILD_OUT_OF_SCOPE')
   value={'provider':'Google Drive','client':s['id'],'accountLane':s['lane'],'readOnly':True,'metadataOnly':True,'contentAccessGranted':False,'files':[{k:f[k] for k in ['id','name','mimeType']} for f in files],'hasMore':bool(data.get('nextPageToken')),'nextPageToken':data.get('nextPageToken')}
  if scope_override is None:
   fresh=[x for x in load() if x.get('id')==s['id']]
   if len(fresh)!=1 or digest(fresh[0])!=expected:raise ValueError('BUSINESS_CLIENT_SCOPE_CHANGED')
  return value
 finally:session.close()
