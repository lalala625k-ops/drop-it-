"""A killable, hidden COM helper so a busy editor cannot block the desktop."""
import json
import os
import queue
import subprocess
import sys
import threading
from pathlib import Path


class DocumentProbe:
    def __init__(self):
        self._process = None
        self._lock = threading.RLock()
        self._lines = queue.Queue()
        self._closed = False

    def start(self):
        with self._lock:
            if self._closed:
                raise RuntimeError('source helper stopped')
            if self._process and self._process.poll() is None:
                return
            self._start()

    def _start(self):
        command = [sys.executable, '--source-worker'] if getattr(sys, 'frozen', False) else [
            sys.executable, '-u', str(Path(__file__).with_name('source_worker.py'))]
        self._lines = queue.Queue()
        self._process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, encoding='utf-8',
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        process, lines = self._process, self._lines
        def read():
            try:
                for line in process.stdout:
                    lines.put(line)
            except (OSError, ValueError):
                pass
        threading.Thread(target=read, daemon=True).start()
        try:
            if not json.loads(lines.get(timeout=8)).get('ready'):
                raise RuntimeError('source helper failed')
        except Exception:
            self._reset()
            raise

    def read(self, hwnd):
        with self._lock:
            if self._closed:
                return None
            try:
                if not self._process or self._process.poll() is not None:
                    self.start()
                self._process.stdin.write(json.dumps({'hwnd': hwnd}) + '\n')
                self._process.stdin.flush()
                return json.loads(self._lines.get(timeout=1.5)).get('source')
            except Exception:
                self._reset()
                return None

    def stop(self):
        with self._lock:
            self._closed = True
            self._reset()

    def _reset(self):
        process, self._process = self._process, None
        if process:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=2)
            for stream in (process.stdin, process.stdout):
                if stream:
                    stream.close()
