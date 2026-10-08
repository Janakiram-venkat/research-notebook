"""Make a consistent copy of the notebook database (safe while the server is running).

    python scripts/backup.py /backups/notebook-$(date +%F).db

Uses SQLite's online backup API, so it never copies a half-written file. Copy the
result to S3 (aws s3 cp) from cron; see docs/DEPLOY_AWS.md.
"""

import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.config import get_settings  # noqa: E402


def backup(dest: str) -> None:
    src = sqlite3.connect(get_settings().db_path)
    out = sqlite3.connect(dest)
    try:
        src.backup(out)
    finally:
        out.close()
        src.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: backup.py DEST_FILE")
    backup(sys.argv[1])
    print("wrote", sys.argv[1])
