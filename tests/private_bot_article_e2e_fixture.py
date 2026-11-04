"""Test-only stdin harness: real dispatch queue/driver, labelled fake engine SDK.
No production flags or imports; no credentials, real clients, model or Google calls.
"""
import contextlib, fcntl, importlib.util, json, pathlib, sys, tempfile, types
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('queue_fixtures',HERE/'private_bot_article_queue_test.py');t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
q,s=t.q,t.s

def run(v):
    q.validate(v)
    with tempfile.TemporaryDirectory(prefix='article-full-qa-') as tmp:
        root=pathlib.Path(tmp);engine=root/'engine';engine.mkdir();notes=root/'notes';notes.mkdir();package=root/'canonical-fixture';package.mkdir();stage=package/'article-generation-simple/attempt-1';nativeout=stage/'personal-native-delivery';jid=int(v['binding']['jobId']);calls=[]
        job={'id':jid,'target_cell':v['binding']['cell']};snapshot={'job':job,'package':package,'fingerprint':'controlled-fixture','db':root/'unused','proof':{'status':'queued','proofVerified':False}}
        def save(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value))
        def locked(stage_name):
            # A second OS-level opener must fail during every dispatched stage.
            with (notes/('article-'+str(jid)+'.lock')).open('a+') as other:
                try:fcntl.flock(other,fcntl.LOCK_EX|fcntl.LOCK_NB)
                except BlockingIOError:pass
                else:raise AssertionError('canonical flock was not retained')
            calls.append(stage_name)
        class Runtime:
            def preflight(self,j):assert j==job
            def execute(self,j,stage_name):
                with g.article_lock(engine,jid):
                    locked(stage_name)
                    if stage_name=='writer':save(stage/'article.md','CONTROLLED FIXTURE ONLY')
                    elif stage_name=='review':save(stage/'single-qa-review.json',{'status':'HOLD','findings':[{'severity':'must_fix'}]})
                    elif stage_name=='fix':save(stage/'single-fixed-article.md','CONTROLLED FIXTURE CORRECTION')
        @contextlib.contextmanager
        def original_lock(*args):raise AssertionError('service should hold the genuine outer lock');yield
        g=types.ModuleType('article_generation');g.article_lock=original_lock;g.ENGINE=engine;g.__file__=str(engine/'article_generation.py')
        p=types.ModuleType('brightforge_scn_pilot');p.ENGINE=engine;p.NOTES=notes/'runtime';p.allocation=lambda:{jid:job};p.Runtime=Runtime;p.load_job=lambda i:job
        n=types.ModuleType('brightforge_scn_native');n.__file__=str(engine/'native.py');n.exact=lambda j:j;n.frozen=lambda i:(job,{},nativeout);n.require_callback_simulation=lambda j,v,out:None
        def targeted(i):
            with g.article_lock(engine,i):locked('targeted');save(stage/'personal-targeted-acceptance/targeted-checks.json',{'fixture':True})
        def freeze(i):
            with g.article_lock(engine,i):
                locked('freeze');save(nativeout/'frozen-job.json',job);save(notes/(job['target_cell']+'-actual-frozen-complete-callback-simulation.json'),{'fixture':True})
        def upload(i):
            with g.article_lock(engine,i):locked('upload');save(nativeout/'render.json',{'fixture':True})
        def vision(i):
            with g.article_lock(engine,i):locked('vision');save(nativeout/'courier-review.json',{'status':'PASS','fixture':True});save(nativeout/'echo-render-inspection.json',{'fixture':True})
        def finish(i):
            with g.article_lock(engine,i):
                locked('finish');save(nativeout/'receipt.json',{'fixture':True});snapshot['proof']={'status':'handoff_verified','proofVerified':True}
        for name,fn in [('targeted',targeted),('freeze',freeze),('upload',upload),('vision',vision),('finish',finish)]:setattr(n,name,fn)
        for name in ['article_generation.py','simple_route.py','single_review.py','native.py','scn_complete_callback_offline.py']:(engine/name).write_text('# CONTROLLED QA fixture module pin only\n')
        queue=q.Queue(root/'queue');rid=queue.submit(v,snapshot);authority=t.Authority()
        with patch.dict(sys.modules,{'article_generation':g,'brightforge_scn_pilot':p,'brightforge_scn_native':n}),patch.object(s,'ROOT',engine),patch.object(s,'NOTES',notes),patch.object(s,'active_production_owner',return_value=False),patch.object(s.Driver,'check_ownership',return_value=None):
            q.run_owned(queue,rid,authority,lambda binding:snapshot,s.Driver)
        result=queue.public(rid);assert result['status']=='completed',result
        assert calls==['writer','review','fix','targeted','freeze','upload','vision','finish'],calls
        return dict(result,label='CONTROLLED_QA_ONLY_NOT_REAL_CLIENT_DELIVERY',stages=calls,kernelLockCheckedAtEveryStage=True,realModelCalls=0,realGoogleWrites=0)
if __name__=='__main__':print(json.dumps(run(json.load(sys.stdin))))
