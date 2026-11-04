"""Fixed service-to-approved-engine stage adapter, no engine implementation edits.

The real engine article flock is held for the entire finite lifecycle. Nested
same-job lock requests reuse that already-held OS lock, never replace it with a
process-local mutex. The independent native-handoff lock remains unchanged.
"""
import contextlib, fcntl, hashlib, json, os, pathlib, sqlite3, sys, time
ROOT=pathlib.Path('/home/benecho/state/article-production/article-generation-simple')
NOTES=pathlib.Path('/home/benecho/state/worknotes/article-generation-simple')
class EngineHold(Exception):
    def __init__(self,code):super().__init__(code);self.safe_code=code

def need(ok,code):
    if not ok:raise EngineHold(code)
def read(p):return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def active_production_owner(jid=None):
    # A mission owns the batch even between its stage subprocesses. Do not
    # steal an idle-looking per-article lock from a currently active owner.
    for d in pathlib.Path('/proc').iterdir():
        if not d.name.isdigit() or int(d.name)==os.getpid():continue
        try:args=[x.decode() for x in (d/'cmdline').read_bytes().split(b'\0') if x]
        except (OSError,UnicodeError):continue
        if jid is not None:
            try:
                marker=b'ARTICLE_TASK_JOB_ID='+str(jid).encode()
                if marker in (d/'environ').read_bytes().split(b'\0'):return True
            except OSError:pass
            if '--job' in args:
                i=args.index('--job')
                if len(args)>i+1 and args[i+1]==str(jid) and any(a.startswith(str(ROOT)+'/') for a in args):return True
        if 'chat' in args and '--query-file' in args:
            i=args.index('--query-file')
            if len(args)>i+1 and args[i+1].startswith(str(NOTES)+'/'):return True
    return False

class Driver:
    def __init__(self,envelope,snapshot):
        self.envelope=envelope;self.snap=snapshot;self.j=snapshot['job'];self.jid=int(envelope['binding']['jobId'])
        self.package=snapshot['package'];self.out=self.package/'article-generation-simple/attempt-1'
        self.personal=envelope['binding']['programme']=='brightforge-clients';self.handle=None;self.original_lock=None
    def __enter__(self):
        need(os.environ.get('ECHO_EXECUTION_PRINCIPAL') is None,'ARTICLE_SERVICE_PRINCIPAL_REQUIRED')
        need(not active_production_owner(self.jid),'ARTICLE_ACTIVE_OWNER')
        sys.path.insert(0,str(ROOT));import article_generation as g
        self.g=g
        if self.personal:
            import brightforge_scn_pilot as p,brightforge_scn_native as native
            need(self.jid in p.allocation(),'ARTICLE_PROGRAMME_ROUTE_REQUIRED')
            native.exact(self.j);self.p=p;self.native=native;self.rt=p.Runtime()
            self.native_out=self.out/'personal-native-delivery'
        else:
            import exact_existing_handoff as native
            g.load_job(self.jid);native.scope(self.jid,1)
            self.native=native;self.rt=g;self.native_out=self.out/'exact-existing-delivery'
        self.pins={p:sha(p) for p in (ROOT/'article_generation.py',ROOT/'simple_route.py',ROOT/'single_review.py',pathlib.Path(self.native.__file__),pathlib.Path(__file__))}
        if self.personal:self.pins[ROOT/'scn_complete_callback_offline.py']=sha(ROOT/'scn_complete_callback_offline.py')
        # A correction attempt is never guessed or silently started.
        need(all(p.name=='attempt-1' for p in self.out.parent.glob('attempt-*')),'ARTICLE_ATTEMPT_RECONCILIATION_REQUIRED')
        self.check_ownership()
        self.handle=(NOTES/('article-'+str(self.jid)+'.lock')).open('a+')
        try:fcntl.flock(self.handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            self.handle.close();self.handle=None;raise EngineHold('ARTICLE_ACTIVE_OWNER')
        self.original_lock=g.article_lock
        @contextlib.contextmanager
        def held_article_lock(root,jid):
            need(jid==self.jid and self.handle is not None and not self.handle.closed,'ARTICLE_OWNER_BINDING_CHANGED')
            need(pathlib.Path(root)==(self.p.ENGINE if self.personal else g.ENGINE),'ARTICLE_OWNER_BINDING_CHANGED')
            # The kernel lock was acquired above and remains held through all
            # stage calls and the independent serial native handoff lock.
            yield
        g.article_lock=held_article_lock
        return self
    def __exit__(self,*exc):
        if self.original_lock is not None:self.g.article_lock=self.original_lock
        if self.handle is not None:
            fcntl.flock(self.handle,fcntl.LOCK_UN);self.handle.close();self.handle=None
    def check_ownership(self):
        with sqlite3.connect(self.snap['db'].as_uri()+'?mode=ro',uri=True) as c:
            c.row_factory=sqlite3.Row
            leases=c.execute('select * from article_orchestration_leases where job_id=?',(self.jid,)).fetchall()
            need(not any(r['expires_at']>time.time() for r in leases),'ARTICLE_REPAIR_LEASE_ACTIVE')
            need(c.execute('select count(*) from article_handoff_operations where job_id=?',(self.jid,)).fetchone()[0]==0,'ARTICLE_NATIVE_HISTORY_RECONCILE')
    def consumed(self,directory,prefix,outputs):
        need(not any((directory/x).exists() for x in outputs),'ARTICLE_RETAINED_STAGE_RECONCILE')
        # A prompt/reservation/failed stdout counts as consumed, even without a
        # model answer. Never infer that a timeout made no provider call.
        need(not any(directory.glob(prefix+'-*')),'ARTICLE_RETAINED_STAGE_RECONCILE')
    def next_stage(self):
        if not (self.out/'article.md').exists():
            need(self.envelope['action']=='write','ARTICLE_REPAIR_REQUIRES_CANDIDATE')
            self.consumed(self.out,'writer',('candidate.json',));return 'writer'
        if not (self.out/'single-qa-review.json').exists():
            self.consumed(self.out,'single_review',());return 'review'
        review=read(self.out/'single-qa-review.json')
        need(isinstance(review.get('findings'),list) and review.get('status') in ('PASS','HOLD','FAIL'),'ARTICLE_REVIEW_RECONCILE')
        fixes=[f for f in review['findings'] if f.get('severity')=='must_fix']
        if fixes and not (self.out/'single-fixed-article.md').exists():
            self.consumed(self.out,'single_fix',('single-fix-edits.json',));return 'fix'
        if self.personal:
            if (self.out/'single-fixed-article.md').exists() and not (self.out/'personal-targeted-acceptance/targeted-checks.json').exists():
                self.consumed(self.out/'personal-targeted-acceptance','targeted_checks',());return 'targeted'
            if not (self.native_out/'frozen-job.json').exists():
                need(not self.native_out.exists(),'ARTICLE_FREEZE_RECONCILE');return 'freeze'
            if not self.callback_report().exists():return 'callback-check'
        if not (self.native_out/'render.json').exists():
            if self.personal:
                need(not any(self.native_out.glob('*-dispatch.json')) and not any(self.native_out.glob('*-result.json')) and not (self.native_out/'precreate.json').exists(),'ARTICLE_NATIVE_WRITE_RECONCILE')
            else:need(not self.native_out.exists(),'ARTICLE_NATIVE_WRITE_RECONCILE')
            return 'upload'
        if not (self.native_out/'courier-review.json').exists():
            self.consumed(self.native_out,'courier',());return 'vision'
        need(read(self.native_out/'courier-review.json').get('status')=='PASS','ARTICLE_COURIER_HOLD')
        if self.personal:
            need((self.native_out/'echo-render-inspection.json').exists(),'ARTICLE_ENGINE_RENDER_INSPECTION_REQUIRED')
        need(not (self.native_out/'receipt.json').exists(),'ARTICLE_CANONICAL_RECEIPT_RECONCILE')
        # Native finish owns exact readback and canonical CAS; never write SQL here.
        need(not any(self.native_out.glob('sheet-*')),'ARTICLE_NATIVE_WRITE_RECONCILE')
        return 'finish'
    def preflight(self,stage):
        need(all(p.exists() and sha(p)==h for p,h in self.pins.items()),'ARTICLE_ENGINE_CODE_CHANGED')
        need(not active_production_owner(self.jid),'ARTICLE_ACTIVE_OWNER');self.check_ownership()
        if stage in ('writer','review','fix','targeted'):
            j=self.p.load_job(self.jid) if self.personal else self.g.load_job(self.jid)
            self.rt.preflight(j)
        elif stage=='upload':
            # Test/validate whole native callback chain before any network write.
            if self.personal:
                j,v,out=self.native.frozen(self.jid);self.native.require_callback_simulation(j,v,out)
            else:self.native.authenticate_local(self.jid,1)
    def callback_report(self):
        return self.p.NOTES.parent/(self.j['target_cell']+'-actual-frozen-complete-callback-simulation.json')
    def execute(self,stage):
        if stage=='callback-check':
            import subprocess
            result=subprocess.run([sys.executable,str(ROOT/'scn_complete_callback_offline.py'),'--job',str(self.jid)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=300)
            need(result.returncode==0,'ARTICLE_CALLBACK_CHECK_FAILED')
            return
        if stage in ('writer','review','fix'):
            j=self.p.load_job(self.jid) if self.personal else self.g.load_job(self.jid)
            if self.personal:return self.rt.execute(j,stage)
            if stage=='writer':return self.g.writer(j)
            import single_review
            return (single_review.run if stage=='review' else single_review.fix)(self.g,j)
        if self.personal:
            need(stage in ('targeted','freeze','upload','vision','finish'),'ARTICLE_STAGE_UNKNOWN')
            return getattr(self.native,stage)(self.jid)
        need(stage in ('upload','vision','finish'),'ARTICLE_STAGE_UNKNOWN')
        return getattr(self.native,{'vision':'assess_render'}.get(stage,stage))(self.jid,1,delivery='linked')
    def verify(self,stage):
        if stage=='callback-check':
            j,v,out=self.native.frozen(self.jid);self.native.require_callback_simulation(j,v,out);return
        paths={'writer':self.out/'article.md','review':self.out/'single-qa-review.json','fix':self.out/'single-fixed-article.md','targeted':self.out/'personal-targeted-acceptance/targeted-checks.json','freeze':self.native_out/'frozen-job.json','upload':self.native_out/'render.json','vision':self.native_out/'courier-review.json','finish':self.native_out/'receipt.json'}
        need(paths[stage].is_file(),'ARTICLE_STAGE_RESULT_MISSING')
        if stage=='vision':need(read(paths[stage]).get('status')=='PASS','ARTICLE_COURIER_HOLD')
