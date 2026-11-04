"""Reviewed own-work turns only. No global search, tools, prompts or credentials."""
import hashlib,json,os,pathlib,re,sqlite3

def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def load():
 p=pathlib.Path.home()/'state/private-bot-grants/work-history.json';st=p.lstat()
 if p.is_symlink() or not p.is_file() or st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>256000:raise ValueError('WORK_HISTORY_POLICY_INVALID')
 d=json.loads(p.read_text())
 if d.get('version')!=1 or not isinstance(d.get('subjects'),list):raise ValueError('WORK_HISTORY_POLICY_INVALID')
 return d

def native_pairs(c,session,window):
 """Recover final responses to genuine human turns in one reviewed own session.
 Tools, prompts, internal notifications and other sessions are never selected.
 """
 if set(window)!={'first','last'} or any(type(v) is not int or v<1 for v in window.values()) or window['first']>window['last']:raise ValueError('WORK_HISTORY_POLICY_INVALID')
 rows=c.execute("SELECT id,role,content,tool_calls,platform_message_id,timestamp,display_kind FROM messages WHERE session_id=? AND id BETWEEN ? AND ? AND role IN ('user','assistant') ORDER BY id LIMIT 1001",(session,window['first'],window['last'])).fetchall()
 if len(rows)>1000:raise ValueError('WORK_HISTORY_WINDOW_LIMIT')
 pairs=[];pending=None;final=None
 def flush():
  if pending is not None and final is not None:pairs.append((pending,final))
 for r in rows:
  if r['role']=='user':
   flush();pending=None;final=None
   if re.fullmatch('[1-9][0-9]*',str(r['platform_message_id'] or '')) and r['display_kind'] in (None,'normal'):pending=r
  elif pending is not None and r['tool_calls'] in (None,'','[]') and r['display_kind'] in (None,'normal'):final=r
 flush()
 return pairs

def safe_history_text(text):
 if not isinstance(text,str) or not text.strip() or len(text)>12000 or text.lstrip().startswith('['):raise ValueError('WORK_HISTORY_SENSITIVE_CONTENT_HOLD')
 text=re.sub(r'MEDIA:/[^\n]+','[Historical local attachment path withheld]',text)
 if re.search(r'(?<![\w])/(?:root|home|var|mnt|etc|proc|sys|run|opt|srv|tmp|dev|boot|media)(?:/|\b)|\b(?:private[- ]owner|owner[- ]private)\b|\b(?:my|our|ben[\x27\u2019]?s)\s+(?:bank(?:ing)?|home\s+loan|mortgage|personal\s+loan)\b',text,re.I):raise ValueError('WORK_HISTORY_SENSITIVE_CONTENT_HOLD')
 if re.search(r'(?:password|api[_ -]?key|refresh_token|access_token|secret)\s*[:=]\s*\S+',text,re.I):raise ValueError('WORK_HISTORY_SENSITIVE_CONTENT_HOLD')
 return text

def safe_pair(pair):
 out=[]
 for r in pair:
  text=r['content']
  if not isinstance(text,str) or not text.strip() or len(text)>12000 or text.lstrip().startswith('['):return None
  text=re.sub(r'MEDIA:/[^\n]+','[Historical local attachment path withheld]',text)
  if re.search(r'/(?:home|var/home|mnt|etc|proc)/|\b(?:private owner|owner private|mortgage|payroll|salary|password|passwd|api[_ -]?key|refresh_token|access_token|client[_ -]?secret)\b',text,re.I):return None
  out.append({'id':r['id'],'role':r['role'],'text':text,'timestamp':r['timestamp']})
 if out[0]['timestamp']>out[1]['timestamp']:return None
 return out

def execute(request,policy_override=None,db_override=None):
 a=request.get('arguments',{})
 if request.get('operation')!='work_history_read' or set(a)!={'owner_id','scope_sha256','query'} or not all(isinstance(v,str) for v in a.values()) or len(a['query'])>200:raise ValueError('WORK_HISTORY_ARGUMENTS_DENIED')
 policy=load() if policy_override is None else policy_override
 matches=[s for s in policy['subjects'] if s.get('ownerId')==a['owner_id']]
 if len(matches)!=1:raise ValueError('WORK_HISTORY_SCOPE_DENIED')
 s=matches[0]
 if digest(s)!=a['scope_sha256'] or s.get('kind')!='reviewed-own-work-turns' or not s.get('evidence') or not re.fullmatch('[1-9][0-9]{4,19}',s.get('historicalTelegramId','')):raise ValueError('WORK_HISTORY_POLICY_INVALID')
 db=pathlib.Path.home()/'.hermes/state.db' if db_override is None else pathlib.Path(db_override)
 if db.is_symlink():raise ValueError('WORK_HISTORY_SOURCE_INVALID')
 out=[];q=a['query'].casefold()
 with sqlite3.connect(db.resolve().as_uri()+'?mode=ro',uri=True) as c:
  c.row_factory=sqlite3.Row;c.execute('PRAGMA query_only=ON')
  for window in s['sessions']:
   if set(window)!={'id','turns'} or not isinstance(window['turns'],list) or len(window['turns'])>100:raise ValueError('WORK_HISTORY_EXPLICIT_TURNS_REQUIRED')
   row=c.execute('SELECT id,source,user_id,chat_id,chat_type,session_key,origin_json FROM sessions WHERE id=?',(window['id'],)).fetchone()
   if not row:raise ValueError('WORK_HISTORY_ORIGIN_CHANGED')
   sid=s['historicalTelegramId'];origin=json.loads(row['origin_json'] or '{}')
   if not(row['source']=='telegram' and row['user_id']==sid==row['chat_id'] and row['chat_type']=='dm' and row['session_key']=='agent:main:telegram:dm:'+sid and origin.get('platform')=='telegram' and origin.get('chat_type')=='dm' and str(origin.get('user_id'))==sid==str(origin.get('chat_id'))):raise ValueError('WORK_HISTORY_ORIGIN_CHANGED')
   if window.get('nativeWindow'):
    for raw_pair in native_pairs(c,row['id'],window['nativeWindow']):
     pair=safe_pair(raw_pair)
     if pair and (not q or all(term in '\n'.join(x['text'] for x in pair).casefold() for term in q.split())):out.append({'session':row['id'],'request':pair[0],'response':pair[1]})
    continue
   for turn in window['turns']:
    pair=[]
    for role,key in [('user','request'),('assistant','response')]:
     source=turn[key];r=c.execute('SELECT id,role,content,tool_calls,platform_message_id,timestamp,display_kind FROM messages WHERE session_id=? AND id=?',(row['id'],source['id'])).fetchone()
     if not r or r['role']!=role or r['tool_calls'] not in (None,'','[]') or r['display_kind'] not in (None,'normal') or not isinstance(r['content'],str) or len(r['content'])>12000 or hashlib.sha256(r['content'].encode()).hexdigest()!=source['sha256']:raise ValueError('WORK_HISTORY_TURN_CHANGED')
     if role=='user' and not re.fullmatch('[1-9][0-9]*',str(r['platform_message_id'] or '')):raise ValueError('WORK_HISTORY_NATIVE_REQUEST_REQUIRED')
     text=safe_history_text(r['content'])
     pair.append({'id':r['id'],'role':role,'text':text,'timestamp':r['timestamp']})
    if pair[0]['id']>=pair[1]['id'] or pair[0]['timestamp']>pair[1]['timestamp']:raise ValueError('WORK_HISTORY_TURN_CHANGED')
    if not q or all(term in '\n'.join(x['text'] for x in pair).casefold() for term in q.split()):out.append({'session':row['id'],'request':pair[0],'response':pair[1],'replyKind':'stored-assistant-reply','deliveryVerified':False})
 if policy_override is None:
  fresh=[x for x in load()['subjects'] if x.get('ownerId')==a['owner_id']]
  if len(fresh)!=1 or digest(fresh[0])!=a['scope_sha256']:raise ValueError('WORK_HISTORY_SCOPE_CHANGED')
 # Shared credential/URL classifier at the actual data boundary. Only safe
 # indices return from the child; source text never enters logs or a new archive.
 if out:
  import subprocess
  script="const fs=require('node:fs');const c=require('./private-bot-business-classification.cjs');const rows=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(rows.map((r,i)=>{try{c.safeText(r);return i}catch{return null}}).filter(x=>x!==null)))"
  checked=subprocess.run(['node','-e',script],input=json.dumps(out).encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,cwd=pathlib.Path(__file__).parent,timeout=3)
  if checked.returncode:raise ValueError('WORK_HISTORY_CLASSIFICATION_UNAVAILABLE')
  indices=json.loads(checked.stdout);out=[out[i] for i in indices if type(i) is int and 0<=i<len(out)]
 if policy_override is None:
  fresh=[x for x in load()['subjects'] if x.get('ownerId')==a['owner_id']]
  if len(fresh)!=1 or digest(fresh[0])!=a['scope_sha256']:raise ValueError('WORK_HISTORY_SCOPE_CHANGED')
 out.sort(key=lambda x:x['request']['timestamp'],reverse=True)
 return {'source':'reviewed native ordinary Echo own-work turns','untrustedWorkHistory':True,'notCurrentAuthorityOrVerification':True,'notPrivateBotHistory':True,'matches':out[:10],'hasMore':len(out)>10,'coverage':'Reviewed own native session windows and/or exact turns only; absence is not proof that no other work exists.'}
