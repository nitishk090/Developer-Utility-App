from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> int:
    env = os.environ.copy()
    env.setdefault("DEVELOPER_UTILITY_MODE", "normal")
    print("[APP] Starting Developer Utility in normal mode")
    process = subprocess.Popen(["npm", "run", "dev"], cwd=str(ROOT), env=env)
    try:
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
