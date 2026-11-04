"""Existing-provider read-only adapters. No paid DATA tools, mutations or CMS auth."""
import json,pathlib,re,urllib.request,urllib.parse,datetime,ipaddress,socket
TOOLS={'keywords':'PROJECT_listKeywords','rankings':'PROJECT_getKeywordStats','backlinks':'PROJECT_listProjectBacklinks'}
def mcp(name,args):
 if name not in set(TOOLS.values())|{'PROJECT_listProjects','PROJECT_getSearchEngines'}:raise ValueError('SOFTWARE_OPERATION_DENIED')
 p=pathlib.Path.home()/'.hermes/.env';e={}
 for line in p.read_text().splitlines():
  if line.strip() and not line.lstrip().startswith('#') and '=' in line:
   k,v=line.split('=',1)
   if k.strip() in ('SERANKING_API_KEY','SERANKING_SEO_API_KEY'):e[k.strip()]=v.strip().strip('"').strip("'")
 key=e.get('SERANKING_API_KEY') or e.get('SERANKING_SEO_API_KEY')
 if not key:raise ValueError('SERANKING_CREDENTIAL_UNAVAILABLE')
 req=urllib.request.Request('https://api.seranking.com/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}}).encode(),headers={'X-Api-Key':key,'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26'},method='POST')
 # No redirects may carry the credential to another origin.
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):return None
 with urllib.request.build_opener(NoRedirect).open(req,timeout=30) as r:raw=r.read(240001)
 if len(raw)>240000:raise ValueError('SOFTWARE_RESULT_LIMIT')
 text=raw.decode()
 if text.startswith('event:') or '\ndata:' in text:text=[x[5:].strip() for x in text.splitlines() if x.startswith('data:')][-1]
 d=json.loads(text)
 if d.get('error') or d.get('result',{}).get('isError'):raise ValueError('SERANKING_READ_UNAVAILABLE')
 chunks=d.get('result',{}).get('content',[]);values=[x['text'] for x in chunks if x.get('type')=='text']
 if len(values)!=1:raise ValueError('SERANKING_RESPONSE_INVALID')
 return json.loads(values[0])
def sanitise(x):
 if isinstance(x,list):return [sanitise(v) for v in x]
 if isinstance(x,dict):return {k:sanitise(v) for k,v in x.items() if not re.search('password|secret|token|guest_link|api.?key|email|comment|notes',k,re.I)}
 return x

def execute(op,a,s,call=mcp,public_get=None):
 if op=='client_seranking_read':
  project=s.get('seranking',{}).get('projectId');kind=a.get('kind')
  if type(project) is not int or kind not in TOOLS:raise ValueError('SERANKING_SCOPE_REQUIRED')
  projects=call('PROJECT_listProjects',{})
  if not isinstance(projects,list):raise ValueError('SERANKING_RESPONSE_INVALID')
  hits=[p for p in projects if p.get('id')==project]
  if len(hits)!=1 or urllib.parse.urlsplit(hits[0].get('name','')).hostname not in (s['host'],'www.'+s['host']) or hits[0].get('is_active')!=1:raise ValueError('SERANKING_PROJECT_MISMATCH')
  engines=call('PROJECT_getSearchEngines',{'site_id':project});args={'site_id':project}
  if kind=='rankings':
   start=datetime.date.fromisoformat(a['start_date']);end=datetime.date.fromisoformat(a['end_date'])
   if not 0<=(end-start).days<=93:raise ValueError('SOFTWARE_ARGUMENTS_DENIED')
   args.update(date_from=str(start),date_to=str(end),with_landing_pages='1')
  elif kind=='backlinks':
   offset=a.get('offset','0')
   if not re.fullmatch('[0-9]{1,5}',offset):raise ValueError('SOFTWARE_ARGUMENTS_DENIED')
   args.update(limit=50,offset=int(offset))
  result=call(TOOLS[kind],args)
  return {'provider':'SE Ranking existing project data','client':s['id'],'projectId':project,'kind':kind,'readOnly':True,'newPaidTasks':0,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request':args,'searchEngines':sanitise(engines),'data':sanitise(result),'definition':'Recorded project checks, not a new live SERP. Preserve returned dates/engine/market/device. Missing or zero position is not proof of a loss. Backlinks are the existing monitor, not the entire web backlink index.','pageSize':50 if kind=='backlinks' else None}
 if op!='client_cms_read':raise ValueError('SOFTWARE_OPERATION_DENIED')
 cms=s.get('cms',{});base=cms.get('baseUrl');kind=a.get('kind','pages');page=a.get('page','1')
 u=urllib.parse.urlsplit(base or '')
 if cms.get('type')!='wordpress-public' or u.scheme!='https' or u.hostname not in (s['host'],'www.'+s['host']) or u.path not in ('','/') or u.query or u.fragment or u.username or u.password or u.port or kind not in ('pages','posts') or not re.fullmatch('[1-9][0-9]{0,3}',page):raise ValueError('CMS_PUBLIC_SCOPE_REQUIRED')
 if public_get is None:
  import requests
  addresses=socket.getaddrinfo(u.hostname,443,type=socket.SOCK_STREAM)
  if not addresses or any(not ipaddress.ip_address(x[4][0]).is_global for x in addresses):raise ValueError('CMS_PRIVATE_NETWORK_DENIED')
  public_get=requests.get
 r=public_get(base.rstrip('/')+'/wp-json/wp/v2/'+kind,params={'status':'publish','context':'view','per_page':20,'page':int(page),'_fields':'id,link,slug,status,type,title,modified_gmt,date_gmt'},timeout=20,allow_redirects=False)
 if r.status_code!=200 or len(r.content)>120000:raise ValueError('CMS_PUBLIC_READ_UNAVAILABLE')
 data=r.json()
 if not isinstance(data,list) or len(data)>20 or any(x.get('status')!='publish' or urllib.parse.urlsplit(x.get('link','')).hostname not in (s['host'],'www.'+s['host']) for x in data):raise ValueError('CMS_RESPONSE_OUT_OF_SCOPE')
 return {'provider':'WordPress public REST','client':s['id'],'readOnly':True,'authenticated':False,'draftAccess':False,'kind':kind,'page':int(page),'totalPages':r.headers.get('X-WP-TotalPages'),'data':data,'limitation':'Published records only. No CMS login, drafts, edits, sends or publication capability.'}
