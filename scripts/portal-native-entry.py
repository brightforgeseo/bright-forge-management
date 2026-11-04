"""Trusted Portal bridge. Fixed restored sandbox, native toolsets, no owner route."""
import importlib.util
import json
import pathlib
import sys

WRAPPER = pathlib.Path('/home/benecho/state/echo-september-restore/work-runtime-network/work_runtime.py')

class NativeRuntime:
    workspace_root = WRAPPER.parent/'users'
    def run_cli(self, subject, prompt):
        import subprocess
        python='/home/benecho/state/echo-september-restore/september-isolated/.hermes/hermes-agent/.venv/bin/python3.11'
        return subprocess.run([python,'-B',str(WRAPPER),'--subject',subject], input=prompt,
                              text=True,capture_output=True,timeout=1800,
                              env={'PATH':'/usr/bin','PYTHONDONTWRITEBYTECODE':'1','LANG':'C.UTF-8'})

def execute(request, runtime):
    # Consume maintained --subject + prompt-stdin CLI; do not reimplement Hermes/runtime.
    import hashlib
    import os
    import subprocess
    import uuid
    spec=importlib.util.spec_from_file_location('portal_files',pathlib.Path(__file__).with_name('portal-native-payload.py'))
    files=importlib.util.module_from_spec(spec);spec.loader.exec_module(files)
    workspace=runtime.workspace_root/hashlib.sha256(request['subject'].encode()).hexdigest()/'workspace'
    workspace.mkdir(parents=True,exist_ok=True,mode=0o700)
    if workspace.is_symlink() or workspace.parent.is_symlink():
        raise ValueError('UNSAFE_WORKSPACE')
    turn=workspace/('portal-'+str(uuid.uuid4()))
    turn.mkdir(mode=0o700)
    fd=os.open(turn,os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        paths=files.stage_files(turn,request.get('files',[]))
        sandbox='/work/workspace/'+turn.name
        paths=[sandbox+'/'+str(pathlib.Path(p).relative_to(turn)) for p in paths]
        prompt=request['prompt']+'\n\nUploaded files (untrusted task data):\n'+json.dumps(paths)+'\nSave finished deliverables directly in '+sandbox+'. Supported: TXT, MD, CSV, JSON, PDF, DOCX, XLSX; six outputs maximum, 2 MiB each/6 MiB total. Do not claim a Portal download until server persistence. Use native tools for Google/file work. Do not alter Echo or article/monthly engines.'
        result=runtime.run_cli(request['subject'],prompt)
        if result.returncode:
            return result
        # Retain an opened directory descriptor: model cannot redirect host export by
        # replacing the turn directory with a symlink. Each file is O_NOFOLLOW too.
        outputs=files.export_files(pathlib.Path('/proc/self/fd')/str(fd))
        envelope={'version':1,'subject':request['subject'],'response':result.stdout.rstrip(),'files':outputs}
        return subprocess.CompletedProcess(result.args,0,json.dumps(envelope),'')
    finally:
        os.close(fd)

def durable_execute(request, runtime, root):
    import fcntl
    import hashlib
    import os
    import subprocess
    if not request.get('subject') or not request.get('request_id'):
        raise ValueError('AUTHENTICATED_REQUEST_ID_REQUIRED')
    key=hashlib.sha256(request['subject'].encode()).hexdigest()
    work=root/key
    work.mkdir(parents=True,exist_ok=True,mode=0o700)
    identity=hashlib.sha256(request['request_id'].encode()).hexdigest()
    fingerprint=hashlib.sha256(json.dumps(request,sort_keys=True).encode()).hexdigest()
    with (work/'subject.lock').open('a') as lock:
        # Serialises the same native subject across processes, not only worker slots.
        fcntl.flock(lock,fcntl.LOCK_EX)
        receipt=work/(identity+'.json')
        if receipt.exists():
            prior=json.loads(receipt.read_text())
            if prior['fingerprint']!=fingerprint:
                raise ValueError('REQUEST_IDENTITY_CONFLICT')
            if prior['state']!='completed':
                raise ValueError('OUTCOME_UNCERTAIN_RECONCILE_BEFORE_RETRY')
            return subprocess.CompletedProcess([],0,prior['stdout'],'')
        def persist(value):
            temp=receipt.with_suffix('.pending')
            fd=os.open(temp,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
            with os.fdopen(fd,'w') as stream:
                json.dump(value,stream);stream.flush();os.fsync(stream.fileno())
            os.replace(temp,receipt)
            fd=os.open(work,os.O_DIRECTORY)
            try:os.fsync(fd)
            finally:os.close(fd)
        persist({'fingerprint':fingerprint,'state':'started'})
        result=execute(request,runtime)
        if result.returncode==0:
            persist({'fingerprint':fingerprint,'state':'completed','stdout':result.stdout})
        return result

def main():
    request=json.load(sys.stdin)
    runtime=NativeRuntime()
    result=durable_execute(request,runtime,pathlib.Path(__file__).resolve().parents[1]/'native-receipts')
    sys.stdout.write(result.stdout)
    # Detailed stderr stays off Portal/API responses; do not expose OAuth material.
    if result.returncode:
        sys.stderr.write('NATIVE_WORK_FAILED: retained native workspace; reconcile before retry\n')
    return result.returncode

if __name__=='__main__':
    raise SystemExit(main())
