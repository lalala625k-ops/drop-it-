import json
import os
import shutil
import sqlite3
import threading
from contextlib import closing
from pathlib import Path
from typing import Any, Dict

from backend.services.data_paths import DATA_DIR, LEGACY_DATA_DIR, ASSETS_DIR, SCREENSHOTS_DIR

_lock = threading.RLock()
_db_file = DATA_DIR / "board.sqlite3"


def _legacy_payload() -> Dict[str, Any]:
    source = LEGACY_DATA_DIR / "cards.json"
    if not source.is_file():
        return {"cards": [], "groups": []}
    with source.open(encoding="utf-8") as stream:
        data = json.load(stream)
    return {"cards": data if isinstance(data, list) else data.get("cards", []),
            "groups": [] if isinstance(data, list) else data.get("groups", [])}


def _prepare_directory() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(exist_ok=True)
    SCREENSHOTS_DIR.mkdir(exist_ok=True)
    if _db_file.exists() or DATA_DIR == LEGACY_DATA_DIR:
        return
    source = LEGACY_DATA_DIR / "cards.json"
    if not source.is_file():
        return
    backup = DATA_DIR / "migration-backup"
    if not backup.exists():
        backup.mkdir()
        shutil.copy2(source, backup / "cards.json")
        for name in ("assets", "screenshots"):
            old = LEGACY_DATA_DIR / name
            if old.is_dir():
                shutil.copytree(old, backup / name)
    for name in ("assets", "screenshots"):
        old = LEGACY_DATA_DIR / name
        target = DATA_DIR / name
        if old.is_dir():
            for item in old.iterdir():
                if item.is_file() and not (target / item.name).exists():
                    shutil.copy2(item, target / item.name)


def _connect() -> sqlite3.Connection:
    _prepare_directory()
    connection = sqlite3.connect(_db_file, timeout=30)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=30000")
    connection.execute("CREATE TABLE IF NOT EXISTS objects (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id))")
    connection.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    if connection.execute("SELECT 1 FROM meta WHERE key='revision'").fetchone() is None:
        payload = _legacy_payload()
        with connection:
            for kind, name in (("card", "cards"), ("group", "groups")):
                for item in payload[name]:
                    connection.execute("INSERT OR REPLACE INTO objects VALUES (?,?,?)", (kind, item["id"], json.dumps(item, ensure_ascii=False)))
            connection.execute("INSERT INTO meta VALUES ('revision','0')")
    return connection


class RevisionConflict(Exception):
    pass


def get_revision() -> int:
    with _lock, closing(_connect()) as connection:
        return int(connection.execute("SELECT value FROM meta WHERE key='revision'").fetchone()[0])


def load_data_from_disk() -> Dict[str, Any]:
    with _lock, closing(_connect()) as connection:
        rows = connection.execute("SELECT kind,data FROM objects ORDER BY rowid").fetchall()
        revision = int(connection.execute("SELECT value FROM meta WHERE key='revision'").fetchone()[0])
    return {"cards": [json.loads(raw) for kind, raw in rows if kind == "card"],
            "groups": [json.loads(raw) for kind, raw in rows if kind == "group"],
            "revision": revision}


def apply_changes(base_revision: int, upsert_cards: list, upsert_groups: list,
                  delete_card_ids: list, delete_group_ids: list) -> int:
    with _lock, closing(_connect()) as connection:
        with connection:
            revision = int(connection.execute("SELECT value FROM meta WHERE key='revision'").fetchone()[0])
            if revision != base_revision:
                raise RevisionConflict()
            for kind, items in (("card", upsert_cards), ("group", upsert_groups)):
                for item in items:
                    connection.execute("INSERT OR REPLACE INTO objects VALUES (?,?,?)",
                                       (kind, item["id"], json.dumps(item, ensure_ascii=False)))
            for kind, ids in (("card", delete_card_ids), ("group", delete_group_ids)):
                connection.executemany("DELETE FROM objects WHERE kind=? AND id=?", [(kind, id) for id in ids])
            revision += 1
            connection.execute("UPDATE meta SET value=? WHERE key='revision'", (str(revision),))
    return revision


def replace_all(base_revision: int, data: Dict[str, Any]) -> int:
    with _lock, closing(_connect()) as connection:
        with connection:
            revision = int(connection.execute("SELECT value FROM meta WHERE key='revision'").fetchone()[0])
            if revision != base_revision:
                raise RevisionConflict()
            connection.execute("DELETE FROM objects")
            for kind, name in (("card", "cards"), ("group", "groups")):
                for item in data[name]:
                    connection.execute("INSERT INTO objects VALUES (?,?,?)",
                                       (kind, item["id"], json.dumps(item, ensure_ascii=False)))
            revision += 1
            connection.execute("UPDATE meta SET value=? WHERE key='revision'", (str(revision),))
    return revision


def export_git_snapshot(destination: Path) -> None:
    data = load_data_from_disk()
    destination.mkdir(parents=True, exist_ok=True)
    temporary = destination / "cards.json.tmp"
    temporary.write_text(json.dumps({"cards": data["cards"], "groups": data["groups"]}, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, destination / "cards.json")
    for name in ("assets", "screenshots"):
        source = DATA_DIR / name
        target = destination / name
        target.mkdir(exist_ok=True)
        for item in source.iterdir():
            if item.is_file():
                shutil.copy2(item, target / item.name)


def backup_database(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with _lock, closing(_connect()) as source, closing(sqlite3.connect(destination)) as backup:
        source.backup(backup)
