"""Staged synchronous execution primitive, NOT an authenticated service/tool.
Trusted broker supplies Binding and live fence; neither comes from model args.
No host-terminal fallback. No writes outside caller-selected private stage root.
"""
import base64
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import time
import uuid

class Denied(RuntimeError): pass

@dataclass(frozen=True)
class Binding:
    owner_id: str
    bot_id: str
    id: str
    worker_id: str
    workspace_kind: str

    @classmethod
    def fixture(cls):
        return cls(*(str(uuid.uuid4()) for _ in range(4)), 'echo')

    def validate(self):
        for value in (self.owner_id, self.bot_id, self.id, self.worker_id):
            if str(uuid.UUID(value)) != value: raise Denied('INVALID_BINDING')
        if self.workspace_kind not in {'echo','private_bot'}: raise Denied('INVALID_WORKSPACE')

NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\Z')
def valid_name(name):
    if not isinstance(name,str) or not NAME.fullmatch(name) or '..' in name:
        raise Denied('INVALID_FILE_NAME')

class Sandbox:
    def __init__(self, stage_root):
        self.root = Path(stage_root)
        # Private stage owned by current uid. Never a model-selected directory.
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.root.lstat()
        if self.root.is_symlink() or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise Denied('UNSAFE_STAGE_ROOT')

    def run(self, binding, code, files, fence, *, timeout=4):
        binding.validate()
        if not callable(fence) or fence(binding) is not True: raise Denied('STALE_JOB_LEASE')
        if not isinstance(code,str) or len(code.encode())>60000: raise Denied('CODE_LIMIT')
        if not isinstance(files,dict) or len(files)>16: raise Denied('INPUT_LIMIT')
        encoded={}
        for name,data in files.items():
            valid_name(name)
            if not isinstance(data,bytes): raise Denied('INVALID_INPUT_BYTES')
            encoded[name]=base64.b64encode(data).decode()
        if sum(map(len,files.values()))>512000: raise Denied('INPUT_LIMIT')
        if not 0 < timeout <= 4: raise Denied('TIME_LIMIT')
        python = Path('/usr/bin/python3').resolve(strict=True)
        runner = Path(__file__).with_name('private-bot-local-runner.py').resolve(strict=True)
        argv=['/usr/bin/bwrap','--unshare-all','--unshare-user','--unshare-cgroup','--disable-userns',
              '--assert-userns-disabled','--die-with-parent','--new-session','--cap-drop','ALL',
              '--ro-bind','/usr/lib','/usr/lib','--ro-bind',str(python),'/usr/bin/python3',
              '--symlink','usr/lib','/lib','--symlink','usr/lib','/lib64',
              '--ro-bind',str(runner),'/runner.py','--proc','/proc','--remount-ro','/proc',
              '--dir','/dev','--ro-bind','/dev/null','/dev/null',
              '--ro-bind','/dev/urandom','/dev/urandom',
              '--size','16777216','--tmpfs','/work','--chdir','/work','--remount-ro','/',
              '--clearenv','--setenv','HOME','/work','--setenv','TMPDIR','/work',
              '--setenv','PATH','/usr/bin','--setenv','LANG','C.UTF-8',
              '--','/usr/bin/python3','-I','-S','-B','/runner.py']
        payload=json.dumps({'code':code,'files':encoded}).encode()
        # A regular stdin file avoids pipe deadlock, and is outside sandbox mounts.
        import tempfile
        with tempfile.TemporaryFile(dir=self.root) as incoming:
            incoming.write(payload); incoming.seek(0)
            child=subprocess.Popen(argv,stdin=incoming,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                cwd=self.root,env={'PATH':'/usr/bin','LANG':'C.UTF-8'},close_fds=True,start_new_session=True)
            selector=selectors.DefaultSelector()
            for pipe in (child.stdout,child.stderr): selector.register(pipe,selectors.EVENT_READ)
            output={child.stdout:bytearray(),child.stderr:bytearray()}
            start=time.monotonic()
            try:
                while selector.get_map():
                    if time.monotonic()-start>timeout: raise Denied('EXECUTION_TIMEOUT')
                    if fence(binding) is not True: raise Denied('STALE_JOB_LEASE')
                    for key,_ in selector.select(.05):
                        chunk=os.read(key.fileobj.fileno(),65536)
                        if not chunk: selector.unregister(key.fileobj); continue
                        output[key.fileobj].extend(chunk)
                        if sum(map(len,output.values()))>3000000: raise Denied('OUTPUT_LIMIT')
                child.wait(timeout=1)
                if child.returncode: raise Denied('SANDBOX_FAILED_CLOSED:'+bytes(output[child.stderr])[:300].decode(errors='replace'))
                if fence(binding) is not True: raise Denied('STALE_JOB_LEASE')
                response=json.loads(output[child.stdout])
                if set(response)!={'stdout','artifacts'} or not isinstance(response['stdout'],str) or len(response['stdout'].encode())>64000:
                    raise Denied('INVALID_RESPONSE')
                if not isinstance(response['artifacts'],dict) or len(response['artifacts'])>16: raise Denied('ARTIFACT_LIMIT')
                artifacts={}
                for name,body in response['artifacts'].items():
                    valid_name(name)
                    artifacts[name]=base64.b64decode(body,validate=True)
                if sum(map(len,artifacts.values()))>2000000: raise Denied('ARTIFACT_LIMIT')
                # Only validated basename/bytes enter a new private host directory.
                destination=self.root / str(uuid.uuid4())
                destination.mkdir(mode=0o700)
                for name,data in artifacts.items():
                    with open(destination/name,'xb') as target: target.write(data)
                if fence(binding) is not True:
                    import shutil
                    shutil.rmtree(destination)
                    raise Denied('STALE_JOB_LEASE')
                return {'stdout':response['stdout'],'artifacts':artifacts,'directory':str(destination),'binding':binding}
            finally:
                if child.poll() is None:
                    os.killpg(child.pid,signal.SIGKILL)
                child.wait()
                selector.close()
                child.stdout.close();child.stderr.close()
