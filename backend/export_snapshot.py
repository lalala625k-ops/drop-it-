import sys
from pathlib import Path
from backend.services.storage import export_git_snapshot


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m backend.export_snapshot <data-repository-path>")
    export_git_snapshot(Path(sys.argv[1]).resolve())
