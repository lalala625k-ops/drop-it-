"""Cancel native close while an asynchronous disk checkpoint completes."""
import threading
import os
import subprocess


class CloseCheckpoint:
    def __init__(self, window):
        self.window = window
        self.allowed = False
        self.pending = False
        self.lock = threading.Lock()

    def on_closing(self):
        with self.lock:
            if self.allowed:
                return True
            if not self.pending:
                self.pending = True
                threading.Thread(target=self._checkpoint, daemon=True, name="WorkspaceCloseCheckpoint").start()
        # FormClosing runs on the UI thread: never wait for JavaScript here.
        return False

    def _checkpoint(self):
        completed = threading.Event()
        outcome = {"saved": False}
        def acknowledged(result):
            outcome["saved"] = result is True
            completed.set()
        try:
            self.window.evaluate_js("(async () => typeof window.pinboardFlushDraft === 'function' ? await window.pinboardFlushDraft() : true)()", acknowledged)
            if completed.wait(15) and outcome["saved"]:
                with self.lock:
                    self.allowed = True
                self.window.destroy()
                return
            self.window.evaluate_js("window.dispatchEvent(new CustomEvent('pinboard-close-failed'))")
        except Exception:
            if not self.window.events.loaded.is_set():
                with self.lock:
                    self.allowed = True
                self.window.destroy()
        finally:
            with self.lock:
                self.pending = False


def attach_close_checkpoint(window):
    checkpoint = CloseCheckpoint(window)
    window.events.closing += checkpoint.on_closing
    return checkpoint


def stop_owned_process(process):
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       creationflags=subprocess.CREATE_NO_WINDOW, timeout=5)
    else:
        process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
