from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

ROOT = Path(__file__).resolve().parent
IGNORED_DIRS = {
    ".git",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    ".idea",
    ".vscode",
    "node_modules",
    "release",
    "release-installer",
    "release-layout",
    "release-new",
}
IGNORED_SUFFIXES = (".pyc",)
TARGETS = ("src", "electron", "assets")
DEBOUNCE_SECONDS = 0.4


def is_ignored(path: Path) -> bool:
    parts = set(path.parts)
    if any(part in IGNORED_DIRS for part in parts):
        return True
    return path.name.endswith(IGNORED_SUFFIXES)


class DevHandler(FileSystemEventHandler):
    def __init__(self, parent: "DevRunner") -> None:
        self.parent = parent
        self.pending: dict[str, float] = {}

    def _queue(self, path: str) -> None:
        now = time.monotonic()
        if path in self.pending and now - self.pending[path] < DEBOUNCE_SECONDS:
            return
        self.pending[path] = now
        self.parent.handle_change(path)

    def on_any_event(self, event) -> None:
        if event.is_directory:
            return
        if event.src_path.endswith("dev.py"):
            return
        path = Path(event.src_path)
        if is_ignored(path):
            return
        if not any(target in path.parts for target in TARGETS):
            return
        if path.suffix.lower() not in {".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json", ".py"}:
            return
        self._queue(str(path.relative_to(ROOT)))


class DevRunner:
    def __init__(self) -> None:
        self.process: subprocess.Popen[str] | None = None
        self.observer: Observer | None = None
        self.handler = DevHandler(self)

    def start_app(self) -> None:
        env = os.environ.copy()
        env.setdefault("DEVELOPER_UTILITY_MODE", "development")
        print("[DEV] Started")
        print("[DEV] Watching project")
        self.process = subprocess.Popen(["npm", "run", "dev"], cwd=str(ROOT), env=env)

    def start_watcher(self) -> None:
        self.observer = Observer()
        self.observer.schedule(self.handler, str(ROOT), recursive=True)
        self.observer.start()

    def handle_change(self, path: str) -> None:
        print(f"[DEV] Changed: {path}")
        is_renderer = any(part in path for part in ("src/", "assets/"))
        is_main = path.startswith("electron/")
        if is_renderer:
            print("[DEV] Renderer files are hot-reloaded by Vite automatically.")
            return
        if is_main:
            print("[DEV] Reloading Electron main process.")
            self.restart_app()
            return
        print("[DEV] Reloading app via safe fallback restart.")
        self.restart_app()

    def restart_app(self) -> None:
        if self.process is None:
            self.start_app()
            return
        try:
            if os.name == "nt":
                self.process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                self.process.terminate()
            self.process.wait(timeout=10)
        except Exception:
            if self.process.poll() is None:
                self.process.kill()
        self.start_app()

    def stop(self) -> None:
        if self.observer is not None:
            self.observer.stop()
            self.observer.join(timeout=5)
        if self.process is not None and self.process.poll() is None:
            try:
                if os.name == "nt":
                    self.process.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    self.process.terminate()
                self.process.wait(timeout=10)
            except Exception:
                if self.process.poll() is None:
                    self.process.kill()


def main() -> int:
    runner = DevRunner()
    runner.start_app()
    runner.start_watcher()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[DEV] Shutting down")
        runner.stop()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
