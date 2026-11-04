"""Controlled service queue fixtures, never real client delivery or Google writes."""
import contextlib, importlib.util, json, os, pathlib, sqlite3, tempfile, unittest, uuid
SCRIPTS=pathlib.Path(__file__).resolve().parents[1]/'scripts'
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
q=module('queue_test','private-bot-article-queue.py');s=module('stages_test','private-bot-article-stages.py')
def envelope():return {'action':'write','owner':str(uuid.uuid4()),'portalJob':str(uuid.uuid4()),'bot':str(uuid.uuid4()),'binding':{'programme':'brightforge-clients','jobId':'123','client':'CONTROLLED QA FIXTURE','source':'12345678901234567890','tab':'Fixture','cell':'D5'},'grant':{'boardId':str(uuid.uuid4()),'taskId':'fixture'}}
class Authority:
    def __init__(self):self.revoked=False;self.calls=0
    def check(self,v):
        self.calls+=1
        if self.revoked:raise q.Held('ARTICLE_SOURCE_GRANT_REQUIRED')
class FixtureDriver:
    stages=('writer','review','fix','targeted','freeze','upload','vision','finish')
    def __init__(self,state,root):self.state=state;self.root=root
    def __enter__(self):
        self.lock=q.file_lock(self.root/'canonical-article.lock');self.lock.__enter__();return self
    def __exit__(self,*args):return self.lock.__exit__(*args)
    def next_stage(self):return self.stages[len(self.state['calls'])]
    def preflight(self,stage):
        if self.state.get('lease'):raise q.Held('ARTICLE_REPAIR_LEASE_ACTIVE')
        if self.state.get('wait')==stage:raise q.Held('ARTICLE_ENGINE_RENDER_INSPECTION_REQUIRED')
        if self.state.get('retained')==stage:raise q.Held('ARTICLE_RETAINED_STAGE_RECONCILE')
    def execute(self,stage):
        self.state['calls'].append(stage)
        # Actual fixture artefact writes, not a fabricated production receipt.
        (self.root/(stage+'.json')).write_text(json.dumps({'label':'CONTROLLED QA FIXTURE','stage':stage}))
        if self.state.get('fail')==stage:raise RuntimeError('controlled failure')
        if stage=='finish':self.state['accepted']=True
    def verify(self,stage):assert (self.root/(stage+'.json')).is_file()
class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='article-queue-fixture-');self.root=pathlib.Path(self.temp.name);self.queue=q.Queue(self.root/'queue');self.v=envelope();self.authority=Authority();self.state={'calls':[]}
    def tearDown(self):self.temp.cleanup()
    def snap(self,_):return {'fingerprint':self.state.get('fingerprint','fixed'),'proof':{'status':'handoff_verified' if self.state.get('accepted') else 'queued','proofVerified':bool(self.state.get('accepted'))}}
    def submit(self):return self.queue.submit(self.v,self.snap(None))
    def runqueue(self,rid):q.run_owned(self.queue,rid,self.authority,self.snap,lambda v,snap:FixtureDriver(self.state,self.root))
    def test_end_to_end_missing_stages_persistent_readback(self):
        rid=self.submit();self.assertEqual(self.queue.public(rid)['status'],'pending');self.runqueue(rid)
        self.assertEqual(self.queue.public(rid)['status'],'completed');self.assertEqual(self.state['calls'],list(FixtureDriver.stages));self.assertEqual(set(self.queue.stage_records(rid).values()),{'returned'});self.assertGreater(self.authority.calls,8)
        other=q.Queue(self.queue.root);self.assertEqual(other.get(rid)['owner'],self.v['owner']);self.runqueue(rid);self.assertEqual(len(self.state['calls']),8)
    def test_duplicate_single_engine_owner(self):
        rid=self.submit();self.v['portalJob']=str(uuid.uuid4());self.assertEqual(self.submit(),rid)
        self.v['owner']=str(uuid.uuid4())
        with self.assertRaisesRegex(q.Held,'ANOTHER'):self.submit()
    def test_source_changed(self):
        rid=self.submit();self.state['fingerprint']='changed';self.runqueue(rid);self.assertEqual(self.queue.public(rid)['code'],'ARTICLE_SOURCE_CHANGED');self.assertEqual(self.state['calls'],[])
    def test_revoked_current_assignment(self):
        rid=self.submit();self.authority.revoked=True;self.runqueue(rid);self.assertEqual(self.queue.public(rid)['code'],'ARTICLE_SOURCE_GRANT_REQUIRED');self.assertEqual(self.state['calls'],[])
    def test_retained_failed_stage_not_replayed(self):
        rid=self.submit();self.state['fail']='review';self.runqueue(rid);self.assertEqual(self.queue.public(rid)['status'],'failed');self.assertEqual(self.queue.stage_records(rid)['review'],'failed');self.runqueue(rid);self.assertEqual(self.state['calls'],['writer','review'])
    def test_prior_retained_stage_held_before_dispatch(self):
        rid=self.submit();self.state['retained']='writer';self.runqueue(rid);self.assertEqual(self.queue.public(rid)['status'],'held');self.assertEqual(self.state['calls'],[])
    def test_repair_lease_preserved(self):
        rid=self.submit();self.state['lease']=True;self.runqueue(rid);self.assertEqual(self.queue.public(rid)['code'],'ARTICLE_REPAIR_LEASE_ACTIVE');self.assertEqual(self.state['calls'],[])
    def test_safe_hold_can_resume_without_replaying_stages(self):
        rid=self.submit();self.state['lease']=True;self.runqueue(rid)
        self.assertEqual(self.queue.public(rid)['status'],'held')
        self.state['lease']=False;self.v['portalJob']=str(uuid.uuid4())
        self.assertEqual(self.submit(),rid);self.runqueue(rid)
        self.assertEqual(self.queue.public(rid)['status'],'completed');self.assertEqual(self.state['calls'],list(FixtureDriver.stages))
    def test_poststage_inspection_wait_resumes_only_missing_finish(self):
        rid=self.submit();self.state['wait']='finish';self.runqueue(rid)
        self.assertEqual(self.queue.public(rid)['status'],'held');self.assertEqual(len(self.state['calls']),7)
        self.state['wait']=None;self.v['portalJob']=str(uuid.uuid4());self.submit();self.runqueue(rid)
        self.assertEqual(self.state['calls'],list(FixtureDriver.stages));self.assertTrue(self.queue.public(rid)['newDelivery'])
    def test_resume_lock_contention_preserves_receipts(self):
        rid=self.submit();self.state['lease']=True;self.runqueue(rid)
        with q.file_lock(self.queue.root/(rid+'.lock')):
            with self.assertRaisesRegex(q.Held,'ACTIVE_OWNER'):self.submit()
        self.assertEqual(self.queue.public(rid)['status'],'held')
    def test_external_acceptance_is_not_new_delivery_credit(self):
        rid=self.submit();self.state['accepted']=True;self.runqueue(rid)
        self.assertEqual(self.queue.public(rid)['status'],'completed');self.assertFalse(self.queue.public(rid)['newDelivery']);self.assertEqual(self.state['calls'],[])
    def test_failed_stage_cannot_be_resubmitted_as_new_work(self):
        rid=self.submit();self.state['fail']='review';self.runqueue(rid);self.v['portalJob']=str(uuid.uuid4());self.submit();self.runqueue(rid)
        self.assertEqual(self.queue.public(rid)['status'],'failed');self.assertEqual(self.state['calls'],['writer','review'])
    def test_kernel_lock_excludes_second_worker(self):
        rid=self.submit()
        with q.file_lock(self.queue.root/(rid+'.lock')):
            with self.assertRaisesRegex(q.Held,'ACTIVE_OWNER'):self.runqueue(rid)
        self.assertEqual(self.state['calls'],[])
    def test_crashed_owner_not_reported_running(self):
        rid=self.submit();self.queue.update(rid,status='running',pid=999999999,started='none');self.assertEqual(self.queue.public(rid)['code'],'ARTICLE_OWNER_LOST_RECONCILE')
    def test_accepted_immutable(self):
        self.state['accepted']=True
        with self.assertRaisesRegex(q.Held,'ACCEPTED'):self.submit()
    def test_schema_injection(self):
        for key in ('command','model','path','credentials','instructions'):
            v=dict(self.v,**{key:'untrusted'})
            with self.assertRaises(q.Held):q.validate(v)
    def test_unknown_programme_and_cell(self):
        for field,value in [('programme','other'),('jobId','1;exit'),('cell','D5:D9'),('source','https://example.com')]:
            v=json.loads(json.dumps(self.v));v['binding'][field]=value
            with self.assertRaises(q.Held):q.validate(v)
    def test_completed_stage_without_proof_cannot_claim_delivery(self):
        rid=self.submit();self.state['retained']='finish';self.runqueue(rid);self.assertEqual(self.queue.public(rid)['status'],'held');self.assertFalse(self.queue.public(rid)['newDelivery'])

class StagePlannerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='article-planner-');self.root=pathlib.Path(self.tmp.name)
        self.d=s.Driver(envelope(),{'job':{},'package':self.root});self.d.out.mkdir(parents=True);self.d.native_out=self.d.out/'personal-native-delivery'
        report=self.root/'controlled-callback-report.json';report.write_text('{}');self.d.callback_report=lambda:report
    def tearDown(self):self.tmp.cleanup()
    def write(self,name,value):
        p=self.d.out/name;p.parent.mkdir(exist_ok=True,parents=True);p.write_text(json.dumps(value))
    def test_missing_writer_and_retained_uncertain(self):
        self.assertEqual(self.d.next_stage(),'writer');self.write('writer-prompt.txt',{})
        with self.assertRaisesRegex(s.EngineHold,'RETAINED'):self.d.next_stage()
    def test_next_review_fix_targeted_freeze(self):
        self.write('article.md','fixture');self.assertEqual(self.d.next_stage(),'review')
        self.write('single-qa-review.json',{'status':'HOLD','findings':[{'severity':'must_fix'}]});self.assertEqual(self.d.next_stage(),'fix')
        self.write('single-fixed-article.md','fixture');self.assertEqual(self.d.next_stage(),'targeted')
        self.write('personal-targeted-acceptance/targeted-checks.json',{});self.assertEqual(self.d.next_stage(),'freeze')
    def test_repair_never_synthesises_missing_candidate(self):
        self.d.envelope['action']='repair'
        with self.assertRaisesRegex(s.EngineHold,'REPAIR_REQUIRES'):self.d.next_stage()
    def test_postwrite_uncertainty_never_reuploads(self):
        self.write('article.md','fixture');self.write('single-qa-review.json',{'status':'PASS','findings':[]});self.write('personal-native-delivery/frozen-job.json',{});self.write('personal-native-delivery/precreate.json',{})
        with self.assertRaisesRegex(s.EngineHold,'WRITE_RECONCILE'):self.d.next_stage()
    def test_courier_and_real_echo_visual_gate(self):
        self.write('article.md','fixture');self.write('single-qa-review.json',{'status':'PASS','findings':[]});self.write('personal-native-delivery/frozen-job.json',{});self.write('personal-native-delivery/render.json',{})
        self.assertEqual(self.d.next_stage(),'vision');self.write('personal-native-delivery/courier-review.json',{'status':'PASS'})
        with self.assertRaisesRegex(s.EngineHold,'RENDER_INSPECTION_REQUIRED'):self.d.next_stage()
    def test_callback_stage_fixed_command_exit_and_validation(self):
        from unittest.mock import Mock,patch
        from types import SimpleNamespace
        import sys
        self.write('article.md','fixture');self.write('single-qa-review.json',{'status':'PASS','findings':[]});self.write('personal-native-delivery/frozen-job.json',{})
        self.d.callback_report().unlink();self.assertEqual(self.d.next_stage(),'callback-check')
        self.d.native=SimpleNamespace(frozen=Mock(return_value=({}, {}, self.d.native_out)),require_callback_simulation=Mock())
        with patch('subprocess.run',return_value=SimpleNamespace(returncode=0)) as run:
            self.d.execute('callback-check');self.d.verify('callback-check')
            self.assertEqual(run.call_args.args[0],[sys.executable,str(s.ROOT/'scn_complete_callback_offline.py'),'--job','123']);self.d.native.require_callback_simulation.assert_called_once()
        with patch('subprocess.run',return_value=SimpleNamespace(returncode=2)):
            with self.assertRaisesRegex(s.EngineHold,'CALLBACK_CHECK_FAILED'):self.d.execute('callback-check')
    def test_production_owner_probe_is_read_only(self):self.assertIsInstance(s.active_production_owner(),bool)
if __name__=='__main__':unittest.main(verbosity=2)
