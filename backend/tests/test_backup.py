import sqlite3
import sys
from pathlib import Path

from conftest import note


def test_backup_copies_the_database(client, tmp_path):
    assert client.put("/api/notes/a", json=note("a")).status_code == 200
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import backup

    dest = tmp_path / "copy.db"
    backup.backup(str(dest))
    rows = sqlite3.connect(dest).execute("SELECT id FROM notes").fetchall()
    assert rows == [("a",)]
