"""Fixed broker transport. Heartbeats carry no credentials or API connection.
The sandbox receives only validated code/file JSON, never this control pipe.
"""
import base64
import importlib.util
import json
import os
from pathlib import Path
import select
import sys
import tempfile
import time

spec = importlib.util.spec_from_file_location('sandbox', Path(__file__).with_name('private-bot-local-sandbox.py'))
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
# Unbuffered reads avoid consuming heartbeat bytes into a hidden Python buffer.
raw = bytearray()
while True:
    ch = os.read(0, 1)
    if not ch or len(raw) > 1000000:
        raise ValueError('INVALID_TRANSPORT')
    if ch == b'\n': break
    raw.extend(ch)
request = json.loads(raw)
if set(request) != {'binding', 'code', 'files'}: raise ValueError('INVALID_TRANSPORT')
binding = module.Binding(**request['binding'])
files = {name: base64.b64decode(data, validate=True) for name, data in request['files'].items()}
last = time.monotonic()
def fence(_binding):
    global last
    if select.select([0], [], [], 0)[0]:
        data = os.read(0, 4096)
        if not data or any(c not in b'allow\n' for c in data): return False
        last = time.monotonic()
    return time.monotonic() - last < 0.7
with tempfile.TemporaryDirectory(prefix='broker-local-', dir=os.environ['TMPDIR']) as root:
    result = module.Sandbox(root).run(binding, request['code'], files, fence)
    sys.stdout.write(json.dumps({'stdout':result['stdout'], 'artifacts':{
        name:base64.b64encode(data).decode('ascii') for name,data in result['artifacts'].items()}}))
