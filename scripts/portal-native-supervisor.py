"""Linux native launch lifeline: fd 3 is owned only by the Node caller.

EOF (including SIGKILL of Node) kills this dedicated process group. The
maintained wrapper's bwrap --die-with-parent covers its new sandbox session.
No service cgroup, PID polling/reuse, credentials or mutable manifest involved.
"""
import os
import select
import signal
import subprocess
import sys


def terminate():
    os.killpg(os.getpgrp(), signal.SIGKILL)


def main():
    # Fail before launching if the parent died during spawn/exec. fd 3 must exist.
    os.fstat(3)
    if select.select([3], [], [], 0)[0] and not os.read(3, 1):
        terminate()
    # close_fds prevents the payload/descendants from holding the lifeline open.
    child = subprocess.Popen(sys.argv[1:], close_fds=True)
    while True:
        if select.select([3], [], [], 0.05)[0] and not os.read(3, 1):
            terminate()
        code = child.poll()
        if code is not None:
            return code if code >= 0 else 128 - code


if __name__ == '__main__':
    raise SystemExit(main())
