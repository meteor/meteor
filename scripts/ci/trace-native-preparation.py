"""Collect thread stacks only after an otherwise normal preparation fails."""
import os
from pathlib import Path
import re
import signal
import subprocess
import sys

log = Path('/tmp/meteor-preparation.log')
process = subprocess.Popen(sys.argv[1:], stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, text=True,
                           start_new_session=True)
observed_signal = None
try:
    with log.open('w') as output:
        for line in process.stdout:
            print(line, end='', flush=True)
            output.write(line)
            output.flush()
            match = re.search(r'NATIVE_PREPARATION_SIGNAL (\d+) (\d+)', line)
            if not match:
                continue
            pid, observed_signal = map(int, match.groups())
            try:
                trace = subprocess.run([
                    'gdb', '--batch', '--nx', '-p', str(pid),
                    '-ex', 'set pagination off', '-ex', 'set confirm off',
                    '-ex', 'thread apply all bt 40',
                    '-ex', 'info sharedlibrary', '-ex', 'detach',
                ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, timeout=60)
                print(trace.stdout, end='', flush=True)
                output.write(trace.stdout)
                output.flush()
            finally:
                try:
                    os.kill(pid, signal.SIGCONT)
                except ProcessLookupError:
                    pass
            break
    try:
        code = process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        code = process.wait()
finally:
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
if observed_signal:
    raise SystemExit(128 + observed_signal)
raise SystemExit(code if code >= 0 else 128 - code)
