"""Fixed server-side adapter. JSON stdin only; no shell or credential arguments."""
import sys,json,re
from pathlib import Path
sys.path.insert(0,str(Path.home()/'seo-data-tools'))
from dataforseo import Client,DataError,build_operation
from ai_visibility import collect

def clean(value):
 if isinstance(value,dict):return {k:clean(v)for k,v in value.items()if k not in {'evidence_file','rotation_warning','scope','ownerId'}}
 if isinstance(value,list):return [clean(v)for v in value]
 return value

def run(request):
 args=request['input'];owner=request['owner'];run_id=request['id']
 if not all(re.fullmatch(r'[0-9a-f-]{36}',v or '')for v in [owner,run_id]):raise DataError('INVALID_OWNER_OR_RUN')
 scope='portal.'+owner+'.research'
 if args['operation']=='ai-visibility':
  prompts=[{'text':text,'kind':'brand-check'if args['brand'].casefold()in text.casefold()or args['target'].casefold()in text.casefold()else 'discovery'}for text in args['keywords']]
  output=Path(request['output']).resolve();root=(Path.home()/'state/portal-research'/owner).resolve()
  if not output.is_relative_to(root)and not output.is_relative_to((Path.home()/'state/portal-client-preview'/owner).resolve()):raise DataError('INVALID_EVIDENCE_DIRECTORY')
  report=collect({'brand':args['brand'],'domain':args['target'],'scope':scope,'location':args['location'],'language':args['language'],'platforms':args['platforms'],'prompts':prompts},output=output,refresh=args['fresh'],max_batch_cost=.1)
  return clean({'kind':'visibility','complete':report['complete'],'report':report,'htmlReport':(output/'report.html').read_text(),'costUsd':report['new_cost_usd'],'method':report['method'],'retrievedAt':report['created_at']})
 endpoint,payload=build_operation(args['operation'],target=args['target']or None,keywords=args['keywords'],location=args['location'],language=args['language'],limit=args['limit'])
 if args['operation']=='serp'and 'depth'in args:payload['depth']=args['depth']
 result=Client().request(endpoint,payload,scope=scope,max_cost=.3,refresh=args['fresh'])
 rows=[];total=None;metrics={}
 for task in result['data']['response']['tasks']:
  for item in task.get('result')or []:
   if isinstance(item,dict)and isinstance(item.get('items'),list):rows.extend(item['items']);total=item.get('total_count',total)
   else:rows.append(item)
   if isinstance(item,dict):metrics.update({k:v for k,v in item.items()if isinstance(v,(int,float))and not isinstance(v,bool)and k not in ['location_code','items_count']})
 return clean({'kind':'research','operation':args['operation'],'rows':rows,'resultCount':len(rows),'totalCount':total,'metrics':metrics,'costUsd':result['cost_usd'],'originalCostUsd':result['original_cost_usd'],'cached':result['cached'],'billingWarning':result['billing_warning'],'retrievedAt':result['data']['retrieved_at'],'evidenceHash':result['sha256'],'raw':result['data'],'method':'Live Google SERP snapshot'if args['operation']=='serp'else 'DataForSEO research database / estimates; not GSC first-party data'})

if __name__=='__main__':
 try:
  body=sys.stdin.read(65537)
  if len(body)>65536:raise DataError('REQUEST_TOO_LARGE')
  result=run(json.loads(body));print(json.dumps({'type':'result','result':result},ensure_ascii=False),flush=True)
 except Exception as error:
  code=str(error).split(':')[0].split(';')[0]if isinstance(error,DataError)else 'RESEARCH_EXECUTION_FAILED'
  if not re.fullmatch(r'[A-Z_0-9.-]{1,100}',code):code='RESEARCH_EXECUTION_FAILED'
  print(json.dumps({'type':'error','error':code}),flush=True);raise SystemExit(1)
