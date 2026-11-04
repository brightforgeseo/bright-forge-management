"""Read-only sandbox bootstrap. No host paths, credentials or broker connection."""
import base64
import ctypes
import errno
import io
import json
import os
import resource
import stat
import sys

request = json.loads(sys.stdin.buffer.read(1500000))
for name, data in request['files'].items():
    with open('/work/' + name, 'xb') as target:
        target.write(base64.b64decode(data, validate=True))
resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2,) * 2)
resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
resource.setrlimit(resource.RLIMIT_FSIZE, (2 * 1024**2,) * 2)
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))
# Kernel-enforced single-process prototype, not a command/prompt denylist.
lib = ctypes.CDLL('/usr/lib/libseccomp.so.2', use_errno=True)
lib.seccomp_init.argtypes = [ctypes.c_uint32]
lib.seccomp_init.restype = ctypes.c_void_p
lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
lib.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
lib.seccomp_load.argtypes = [ctypes.c_void_p]
lib.seccomp_release.argtypes = [ctypes.c_void_p]
ctx = lib.seccomp_init(0x7fff0000)
if not ctx: raise RuntimeError('SECCOMP_UNAVAILABLE')
for name in (b'clone', b'clone3', b'fork', b'vfork', b'unshare', b'setns', b'ptrace', b'process_vm_readv', b'process_vm_writev'):
    number = lib.seccomp_syscall_resolve_name(name)
    if number < 0 or lib.seccomp_rule_add(ctx, 0x50000 | errno.EPERM, number, 0):
        raise RuntimeError('SECCOMP_RULE_FAILED')
if lib.seccomp_load(ctx): raise RuntimeError('SECCOMP_LOAD_FAILED')
lib.seccomp_release(ctx)
# User code and output are untrusted. Host validates the bounded response anew.
log = io.StringIO()
sys.stdout = log
exec(compile(request['code'], '<ordinary-work>', 'exec'), {'__name__':'__main__'})
artifacts = {}
for name in os.listdir('/work'):
    if name in request['files']: continue
    fd = os.open('/work/' + name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode): raise ValueError('NONREGULAR_OUTPUT')
        data = os.read(fd, 2 * 1024**2 + 1)
        if len(data) > 2 * 1024**2: raise ValueError('OUTPUT_TOO_LARGE')
        artifacts[name] = base64.b64encode(data).decode('ascii')
    finally: os.close(fd)
sys.__stdout__.write(json.dumps({'stdout':log.getvalue(), 'artifacts':artifacts}))
