"""Protected exact-job service queue. Never an article writer or a credential broker.

The Portal only submits typed identities. A detached, finite service worker owns
one existing engine job, revalidates grants, then invokes the approved stages.
No canonical SQL mutations, arbitrary commands, retries of consumed stages, or
client prose in queue/status. Test dependencies are import-only, never CLI flags.
"""
import contextlib, fcntl, hashlib, importlib.util, json, os, pathlib, re, sqlite3, subprocess, sys, time, uuid
from urllib.request import Request, urlopen
ROOT=pathlib.Path('/home/benecho/state/private-bot-article-queue')
ENGINE=pathlib.Path('/home/benecho/state/article-production')
GRANTS=pathlib.Path('/home/benecho/state/private-bot-grants/approved-sources.json')
BINDING=('programme','jobId','client','source','tab','cell')
UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
class Held(Exception): pass

def need(ok, code):
    if not ok: raise Held(code)
def digest(raw): return hashlib.sha256(raw).hexdigest()
def encoded(v): return json.dumps(v,sort_keys=True,separators=(',',':'))
def load_reader():
    spec=importlib.util.spec_from_file_location('private_article_reader',pathlib.Path(__file__).with_name('private-bot-article-reader.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def validate(v):
    need(isinstance(v,dict) and set(v)=={'action','owner','portalJob','bot','binding','grant'},'ARTICLE_ARGUMENTS')
    need(v['action'] in ('write','repair','status'),'ARTICLE_ARGUMENTS')
    need(all(isinstance(v[k],str) and UUID.fullmatch(v[k]) for k in ('owner','portalJob','bot')),'ARTICLE_ARGUMENTS')
    b=v['binding'];need(isinstance(b,dict) and set(b)==set(BINDING),'ARTICLE_ARGUMENTS')
    need(all(isinstance(x,str) and 0<len(x)<=200 and not re.search(r'[\x00-\x1f]',x) for x in b.values()),'ARTICLE_ARGUMENTS')
    need(b['programme'] in ('10xr','brightforge-clients') and re.fullmatch(r'[1-9][0-9]{0,15}',b['jobId']) and re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,6}',b['cell']) and re.fullmatch(r'[A-Za-z0-9_-]{20,200}',b['source']),'ARTICLE_ARGUMENTS')
    need(isinstance(v['grant'],dict) and set(v['grant'])=={'boardId','taskId'} and all(isinstance(x,str) and 0<len(x)<=200 for x in v['grant'].values()),'ARTICLE_ARGUMENTS')

def canonical(binding):
    reader=load_reader();p=reader.read_job(binding['programme'],binding['jobId'])
    need(all(p.get(k)==v for k,v in binding.items()),'ARTICLE_EXACT_BINDING_REQUIRED')
    db,root=reader.ROUTES[binding['programme']]
    with sqlite3.connect(f'file:{ENGINE/db}?mode=ro',uri=True) as c:
        c.row_factory=sqlite3.Row
        j=dict(c.execute('select * from jobs where id=?',(int(binding['jobId']),)).fetchone())
        need(c.execute('select count(*) from jobs where spreadsheet_id=? and sheet_tab=? and target_cell=?',(j['spreadsheet_id'],j['sheet_tab'],j['target_cell'])).fetchone()[0]==1,'ARTICLE_AMBIGUOUS_CELL')
        need(c.execute('select count(*) from jobs where package=?',(j['package'],)).fetchone()[0]==1,'ARTICLE_AMBIGUOUS_PACKAGE')
    package=pathlib.Path(j['package'].replace('/var/home/benpc/','/home/benecho/'))
    need(package.resolve()==package and package.is_relative_to(ENGINE/root),'ARTICLE_PACKAGE_BOUNDARY')
    source=package/'research/source_packet.json'
    need(source.resolve().is_relative_to(package),'ARTICLE_PACKAGE_BOUNDARY')
    fingerprint=digest(encoded({'binding':binding,'package':str(package),'h1':j['h1'],'keywords':j['keywords'],'sourceSha':digest(source.read_bytes())}).encode())
    return dict(proof=p,job=j,package=package,fingerprint=fingerprint,db=ENGINE/db)

class Authority:
    def __init__(self):
        # Used solely by this service. Never inherited by article/model workers.
        self.key=os.environ.pop('SUPABASE_SERVICE_ROLE_KEY','')
        self.url=os.environ.pop('SUPABASE_INTERNAL_URL','http://127.0.0.1:54321').rstrip('/')
        need(self.url=='http://127.0.0.1:54321' and self.key,'ARTICLE_SERVICE_CONFIG_REQUIRED')
    def api(self,path,body=None):
        req=Request(self.url+path,data=encoded(body).encode() if body is not None else None,headers={'apikey':self.key,'Authorization':'Bearer '+self.key,'Content-Type':'application/json'})
        with urlopen(req,timeout=15) as r:return json.load(r)
    def check(self,v,enqueue=False):
        from urllib.parse import urlparse
        need(self.api('/rest/v1/rpc/private_bot_access',{'subject':v['owner']}) is True,'ARTICLE_SOURCE_GRANT_REQUIRED')
        records=self.api('/rest/v1/private_bot_jobs?id=eq.'+v['portalJob']+'&owner_id=eq.'+v['owner']+'&bot_id=eq.'+v['bot']+'&select=id,status,lease_expires_at')
        need(len(records)==1,'ARTICLE_REQUEST_OWNER_MISMATCH')
        if enqueue:
            from datetime import datetime,timezone
            need(records[0]['status']=='running' and datetime.fromisoformat(records[0]['lease_expires_at'].replace('Z','+00:00'))>datetime.now(timezone.utc),'ARTICLE_REQUEST_LEASE_EXPIRED')
        need(GRANTS.is_file() and not GRANTS.is_symlink() and GRANTS.stat().st_uid==os.getuid() and GRANTS.stat().st_mode&0o077==0,'ARTICLE_GRANT_FILE_UNSAFE')
        b=v['binding'];g=v['grant']
        grants=json.loads(GRANTS.read_bytes())['grants']
        need(any(x.get('owner')==v['owner'] and x.get('boardId')==g['boardId'] and x.get('source')==b['source'] and x.get('client')==b['client'] for x in grants),'ARTICLE_SOURCE_GRANT_REQUIRED')
        boards=self.api('/rest/v1/client_boards?id=eq.'+g['boardId']+'&archived=eq.false&select=id,board_data')
        need(len(boards)==1,'ARTICLE_SOURCE_GRANT_REQUIRED')
        data=boards[0]['board_data'];need(not re.search(r'\b(paused|cancelled)\b',data.get('name',''),re.I),'ARTICLE_SOURCE_GRANT_REQUIRED')
        for group in data.get('groups',[]):
            for t in group.get('tasks',[]):
                assignment=t.get('assignedTo')
                assigned=(isinstance(assignment,str) and assignment==v['owner']) or (isinstance(assignment,list) and all(isinstance(x,str) for x in assignment) and v['owner'] in assignment)
                if t.get('id')!=g['taskId'] or not assigned:continue
                for u in (t.get('clientSheet',''),t.get('worksheet','')):
                    parsed=urlparse(u or '')
                    m=re.match(r'^/(?:spreadsheets|document)/d/([A-Za-z0-9_-]{20,200})(?:/|$)',parsed.path)
                    if parsed.scheme=='https' and parsed.netloc=='docs.google.com' and m and m[1]==b['source']:return
        raise Held('ARTICLE_SOURCE_GRANT_REQUIRED')

@contextlib.contextmanager
def file_lock(path):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with path.open('a+') as h:
        try:fcntl.flock(h,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise Held('ARTICLE_ACTIVE_OWNER')
        try:yield h
        finally:fcntl.flock(h,fcntl.LOCK_UN)

class Queue:
    def __init__(self,root=ROOT):
        self.root=root;root.mkdir(parents=True,exist_ok=True,mode=0o700)
        need(not root.is_symlink() and root.stat().st_uid==os.getuid() and root.stat().st_mode&0o077==0,'ARTICLE_QUEUE_UNSAFE')
        self.db=root/'queue.sqlite3'
        with self.connect() as c:
            c.execute('CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, engine_key TEXT UNIQUE, owner TEXT NOT NULL, envelope TEXT NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL, stage TEXT, code TEXT, pid INTEGER, started TEXT, updated REAL NOT NULL)')
            c.execute('CREATE TABLE IF NOT EXISTS stages(request_id TEXT, stage TEXT, state TEXT, at REAL, PRIMARY KEY(request_id,stage))')
        os.chmod(self.db,0o600)
    @contextlib.contextmanager
    def connect(self):
        c=sqlite3.connect(self.db,timeout=15);c.row_factory=sqlite3.Row
        try:
            with c:yield c
        finally:c.close()
    def get(self,rid):
        need(isinstance(rid,str) and UUID.fullmatch(rid),'ARTICLE_ARGUMENTS')
        with self.connect() as c:r=c.execute('select * from requests where id=?',(rid,)).fetchone()
        need(r is not None,'ARTICLE_QUEUE_NOT_FOUND');return dict(r)
    def update(self,rid,**fields):
        need(set(fields)<={'status','stage','code','pid','started'},'ARTICLE_QUEUE_FIELDS')
        with self.connect() as c:c.execute('update requests set '+','.join(k+'=?' for k in fields)+',updated=? where id=?',(*fields.values(),time.time(),rid))
    def stage(self,rid,stage,state):
        with self.connect() as c:
            if state=='dispatched':c.execute('insert into stages values(?,?,?,?)',(rid,stage,state,time.time()))
            else:c.execute('update stages set state=?,at=? where request_id=? and stage=?',(state,time.time(),rid,stage))
    def stage_records(self,rid):
        with self.connect() as c:return {x['stage']:x['state'] for x in c.execute('select * from stages where request_id=?',(rid,))}
    def submit(self,v,snapshot):
        validate(v);key=v['binding']['programme']+':'+v['binding']['jobId']
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');old=c.execute('select * from requests where engine_key=?',(key,)).fetchone()
            if old:
                need(old['owner']==v['owner'],'ARTICLE_OWNED_BY_ANOTHER_REQUEST')
                need(old['fingerprint']==snapshot['fingerprint'],'ARTICLE_SOURCE_CHANGED')
                prior=json.loads(old['envelope']);need(prior['binding']==v['binding'] and prior['grant']==v['grant'],'ARTICLE_EXACT_BINDING_REQUIRED')
                if v['action']!='status':
                    need(prior['action']==v['action'],'ARTICLE_ACTION_CHANGED')
                    safe={'ARTICLE_ACTIVE_OWNER','ARTICLE_REPAIR_LEASE_ACTIVE','ARTICLE_ENGINE_RENDER_INSPECTION_REQUIRED'}
                    if old['status']=='held' and old['code'] in safe:
                        # Explicit, newly authorised resume of an undispatched
                        # waiting boundary only. Keep all consumed stage rows.
                        with file_lock(self.root/(old['id']+'.lock')):
                            need(c.execute("select count(*) from stages where request_id=? and state!='returned'",(old['id'],)).fetchone()[0]==0,'ARTICLE_RETAINED_STAGE_RECONCILE')
                            c.execute("update requests set status='pending',code=null,envelope=?,pid=null,started=null,updated=? where id=?",(encoded(v),time.time(),old['id']))
                return old['id']
            need(v['action']!='status','ARTICLE_QUEUE_NOT_FOUND')
            need(snapshot['proof']['status']!='handoff_verified','ARTICLE_ACCEPTED_JOB_IMMUTABLE')
            rid=str(uuid.uuid4());c.execute('insert into requests values(?,?,?,?,?,?,?,?,?,?,?)',(rid,key,v['owner'],encoded(v),snapshot['fingerprint'],'pending',None,None,None,None,time.time()));return rid
    def public(self,rid):
        r=self.get(rid)
        if r['status']=='running' and not process_alive(r['pid'],r['started']):
            self.update(rid,status='held',code='ARTICLE_OWNER_LOST_RECONCILE');r=self.get(rid)
        return {k:r[k] for k in ('status','stage','code')}|{'requestId':rid,'newDelivery':r['status']=='completed' and self.stage_records(rid).get('finish')=='returned','updatedAt':r['updated']}

def process_start(pid):
    try:return pathlib.Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()[19]
    except OSError:return None
def process_alive(pid,start):return bool(pid and start and process_start(pid)==start)

def run_owned(queue,rid,authority,snapshot=canonical,driver_factory=None):
    """Finite dispatch; an interrupted/failed stage is retained, never reissued."""
    if driver_factory is None:
        spec=importlib.util.spec_from_file_location('private_article_driver',pathlib.Path(__file__).with_name('private-bot-article-stages.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);driver_factory=module.Driver
    with file_lock(queue.root/(rid+'.lock')):
        row=queue.get(rid);v=json.loads(row['envelope'])
        if row['status']!='pending':return
        queue.update(rid,status='running',pid=os.getpid(),started=process_start(os.getpid()),code=None)
        try:
            authority.check(v)
            snap=snapshot(v['binding']);need(snap['fingerprint']==row['fingerprint'],'ARTICLE_SOURCE_CHANGED')
            if snap['proof'].get('proofVerified'):
                queue.update(rid,status='completed',stage='accepted_handoff_reconciled',code=None);return
            with driver_factory(v,snap) as driver:
                for _ in range(12):
                    authority.check(v)
                    now=snapshot(v['binding']);need(now['fingerprint']==row['fingerprint'],'ARTICLE_SOURCE_CHANGED')
                    if now['proof'].get('proofVerified'):
                        queue.update(rid,status='completed',stage='handoff_verified',code=None);return
                    stage=driver.next_stage()
                    need(stage is not None,'ARTICLE_HANDOFF_PROOF_REQUIRED')
                    need(stage not in queue.stage_records(rid),'ARTICLE_RETAINED_STAGE_RECONCILE')
                    driver.preflight(stage)
                    queue.stage(rid,stage,'dispatched');queue.update(rid,stage=stage)
                    try:driver.execute(stage)
                    except BaseException:
                        queue.stage(rid,stage,'failed');raise
                    driver.verify(stage)
                    queue.stage(rid,stage,'returned')
                raise Held('ARTICLE_FINITE_STAGE_LIMIT')
        except Held as e:queue.update(rid,status='held',code=str(e))
        except BaseException as e:
            code=getattr(e,'safe_code','')
            if isinstance(code,str) and re.fullmatch(r'ARTICLE_[A-Z_]+',code):queue.update(rid,status='held',code=code)
            else:queue.update(rid,status='failed',code='ARTICLE_STAGE_FAILED_RECONCILE')

def launch(queue,rid):
    r=queue.get(rid)
    if r['status']!='pending':return
    with (queue.root/(rid+'.log')).open('ab') as out:
        subprocess.Popen([str(ROOT/'venv/bin/python'),str(pathlib.Path(__file__).resolve()),'work',rid],stdin=subprocess.DEVNULL,stdout=out,stderr=out,start_new_session=True,close_fds=True)

def main():
    os.umask(0o077)
    need(os.environ.get('ECHO_EXECUTION_PRINCIPAL') is None,'ARTICLE_SERVICE_PRINCIPAL_REQUIRED')
    if len(sys.argv)==3 and sys.argv[1]=='work':
        authority=Authority();run_owned(Queue(),sys.argv[2],authority);return
    need(len(sys.argv)==1,'ARTICLE_ARGUMENTS');v=json.load(sys.stdin);validate(v)
    # Keep service credentials available to the detached worker, not its models.
    key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY');url=os.environ.get('SUPABASE_INTERNAL_URL')
    authority=Authority();authority.check(v,enqueue=v['action']!='status')
    snap=canonical(v['binding']);queue=Queue();rid=queue.submit(v,snap)
    if v['action']!='status':
        os.environ['SUPABASE_SERVICE_ROLE_KEY']=key
        if url:os.environ['SUPABASE_INTERNAL_URL']=url
        launch(queue,rid)
    print(encoded(queue.public(rid)))
if __name__=='__main__':
    try:main()
    except BaseException as e:
        code=str(e) if isinstance(e,Held) else 'ARTICLE_QUEUE_UNAVAILABLE'
        print(encoded({'error':code}));sys.exit(1)
