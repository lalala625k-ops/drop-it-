"""Exercise disk recovery and directory changes without touching user data."""
import json
import os
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from fastapi import FastAPI
from backend.tests.asgi_client import ASGIClient
from backend.routes import settings, workspaces
from backend.services import data_paths, storage, draft_store, file_settings
from backend.services.workspace_session import session_info


class WorkspaceRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.data = self.root / "data"
        self.stack.enter_context(patch.dict(os.environ, {"PINBOARD_DATA_DIR": str(self.data),
            "PINBOARD_APP_ROOT": str(self.root / "app"), "PINBOARD_NEW_BOARD": "0"}))
        self.stack.enter_context(patch.object(data_paths, "CONFIG_DIR", self.root / "config"))
        self.stack.enter_context(patch.object(data_paths, "CONFIG_FILE", self.root / "config" / "config.json"))
        self.stack.enter_context(patch.object(storage, "LEGACY_DATA_DIR", self.root / "legacy"))
        app = FastAPI()
        app.include_router(settings.router)
        app.include_router(workspaces.router)
        self.client = ASGIClient(app)
        self.options = self.client.get("/api/settings/files").json()
        self.state = {"cards": [{"id": "text", "type": "text", "content": "未保存内容", "x": 0, "y": 0,
                        "width": 240, "height": 100, "zIndex": 1}],
                      "groups": [{"id": "parent", "kind": "parent", "title": "父级", "x": 0, "y": 0}],
                      "viewport": {"x": 123, "y": -45, "zoom": .8},
                      "pins": [{"id": "pin-1", "index": 1, "x": 77, "y": 88}]}

    def checkpoint(self, state=None, board_id=None):
        state = self.state if state is None else state
        suffix = f"?board_id={board_id}" if board_id else ""
        if not board_id:
            revision = storage.force_replace_all(state)
        else:
            revision = None
        info = self.client.get("/api/workspace/current" + suffix).json()
        response = self.client.post("/api/workspace/draft" + suffix, json={**state,
            "workspace_id": info["workspace_id"], "base_revision": revision, "client_revision": 100})
        self.assertEqual(response.status_code, 200, response.text)
        return info["workspace_id"], response.json()["snapshot_id"]

    def test_defaults_create_files_beside_app_and_preserve_live_directory(self):
        self.assertEqual(Path(self.options["save_dir"]), self.root / "app" / "Files" / "Save")
        self.assertEqual(Path(self.options["temp_dir"]), self.root / "app" / "Files" / "Temporary")
        for name in ("Template", "Save", "Temporary"):
            self.assertTrue((self.root / "app" / "Files" / name).is_dir())
        self.assertEqual(data_paths.get_data_dir(), self.data)
        self.assertTrue(self.options["autosave_enabled"])

    def test_unsaved_board_resumes_every_field_and_empty_board_stays_empty(self):
        self.checkpoint()
        loaded = self.client.get("/api/workspace/current").json()
        for key, value in self.state.items():
            self.assertEqual(loaded[key], value)
        empty = {**self.state, "cards": [], "groups": [], "pins": []}
        self.checkpoint(empty)
        loaded = self.client.get("/api/workspace/current").json()
        self.assertTrue(loaded["initialized"])
        self.assertEqual(loaded["cards"], [])
        self.assertEqual(loaded["pins"], [])

    def test_manual_file_is_unchanged_by_later_drafts(self):
        self.checkpoint()
        target = self.root / "formal.drop"
        with patch.object(settings, "choose_drop_file", return_value=target) as choose:
            response = self.client.post("/api/storage/save", json=self.state)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(choose.call_args.args[0].parent, Path(self.options["save_dir"]))
        original = target.read_bytes()
        self.checkpoint({**self.state, "cards": [{**self.state["cards"][0], "content": "新修改"}]})
        self.assertEqual(target.read_bytes(), original)
        self.assertEqual(self.client.get("/api/workspace/current").json()["cards"][0]["content"], "新修改")

    def test_resources_survive_deletion_and_manual_resource_pruning(self):
        asset = self.data / "assets" / "original.png"
        asset.parent.mkdir(parents=True, exist_ok=True)
        asset.write_bytes(b"image-original")
        image_state = {**self.state, "cards": [{**self.state["cards"][0], "image": "/api/assets/original.png"}]}
        workspace_id, snapshot_id = self.checkpoint(image_state)
        self.checkpoint({**self.state, "cards": []})
        with patch.object(settings, "choose_drop_file", return_value=self.root / "deleted.drop"):
            self.assertEqual(self.client.post("/api/storage/save", json={**self.state, "cards": []}).status_code, 200)
        self.assertFalse(asset.exists())
        restored = self.client.post("/api/workspace/restore", json={"workspace_id": workspace_id, "snapshot_id": snapshot_id})
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(asset.read_bytes(), b"image-original")
        self.assertEqual(restored.json()["pins"], self.state["pins"])

    def test_five_distinct_versions_share_one_image_blob(self):
        asset = self.data / "assets" / "same.png"
        asset.parent.mkdir(parents=True, exist_ok=True)
        asset.write_bytes(b"same-image")
        for index in range(7):
            state = {**self.state, "cards": [{**self.state["cards"][0], "content": str(index), "image": "/api/assets/same.png"}]}
            workspace_id, _ = self.checkpoint(state)
        directory = Path(self.options["temp_dir"]) / workspace_id
        self.assertEqual(len(list((directory / "snapshots").glob("*.json"))), 5)
        self.assertEqual(len(list((directory / "resources").iterdir())), 1)
        self.checkpoint(state)
        self.assertEqual(len(list((directory / "snapshots").glob("*.json"))), 5)

    def test_interrupted_write_keeps_previous_snapshot(self):
        workspace_id, snapshot_id = self.checkpoint()
        altered = {**self.state, "viewport": {"x": 9, "y": 0, "zoom": 1}}
        with patch.object(draft_store, "atomic_json", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                draft_store.write_snapshot(session_info(), altered, storage.get_revision(), 101)
        self.assertEqual(draft_store.latest_snapshot(workspace_id)["snapshot_id"], snapshot_id)

    def test_corrupt_latest_falls_back_after_database_loss(self):
        workspace_id, good = self.checkpoint()
        _, bad = self.checkpoint({**self.state, "cards": []})
        path = Path(self.options["temp_dir"]) / workspace_id / "snapshots" / f"{bad}.json"
        path.write_text("broken", encoding="utf-8")
        for name in ("board.sqlite3", "board.sqlite3-wal", "board.sqlite3-shm"):
            (self.data / name).unlink(missing_ok=True)
        loaded = self.client.get("/api/workspace/current").json()
        self.assertEqual(loaded["cards"], self.state["cards"])
        self.assertEqual(draft_store.latest_snapshot(workspace_id)["snapshot_id"], good)

    def test_browser_boards_are_isolated_and_resume(self):
        first, _ = self.checkpoint(board_id="first-board")
        second, _ = self.checkpoint({**self.state, "cards": []}, board_id="second-board")
        self.assertNotEqual(first, second)
        self.assertEqual(self.client.get("/api/workspace/current?board_id=first-board").json()["cards"], self.state["cards"])
        self.assertEqual(self.client.get("/api/workspace/current?board_id=second-board").json()["cards"], [])
        self.assertFalse(self.client.get("/api/workspace/current").json()["initialized"])

    def test_temp_directory_migration_is_verified_and_keeps_old_files(self):
        workspace_id, snapshot_id = self.checkpoint()
        destination = self.root / "new-temp"
        response = self.client.patch("/api/settings/files", json={"temp_dir": str(destination)})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue((destination / workspace_id / "snapshots" / f"{snapshot_id}.json").is_file())
        self.assertTrue((Path(self.options["temp_dir"]) / workspace_id / "snapshots" / f"{snapshot_id}.json").is_file())
        self.assertEqual(self.client.get("/api/workspace/current").json()["cards"], self.state["cards"])

    def test_migration_failure_retains_previous_setting(self):
        self.checkpoint()
        with patch.object(file_settings, "_copy_recoveries", side_effect=OSError("copy failed")):
            result = self.client.patch("/api/settings/files", json={"temp_dir": str(self.root / "failed")})
        self.assertEqual(result.status_code, 400)
        self.assertEqual(self.client.get("/api/settings/files").json()["temp_dir"], self.options["temp_dir"])

    def test_live_directory_migration_preserves_identity_and_complete_state(self):
        workspace_id, _ = self.checkpoint()
        response = self.client.post("/api/settings/storage-path", json={"new_path": str(self.root / "new-data"), "migrate_data": True})
        self.assertEqual(response.status_code, 200, response.text)
        loaded = self.client.get("/api/workspace/current").json()
        self.assertEqual(loaded["workspace_id"], workspace_id)
        self.assertEqual(loaded["viewport"], self.state["viewport"])

    def test_stale_revision_and_wrong_workspace_do_not_write(self):
        workspace_id, _ = self.checkpoint()
        for changes in ({"base_revision": 0}, {"workspace_id": "a" * 32}):
            result = self.client.post("/api/workspace/draft", json={**self.state,
                "workspace_id": workspace_id, "base_revision": storage.get_revision(), **changes})
            self.assertEqual(result.status_code, 409)

    def test_selected_oldest_version_survives_pre_restore_checkpoint(self):
        workspace_id, oldest = self.checkpoint()
        for index in range(4):
            self.checkpoint({**self.state, "cards": [{**self.state["cards"][0], "content": str(index)}]})
        reserved = self.client.post("/api/workspace/reserve-recovery", json={"workspace_id": workspace_id, "snapshot_id": oldest}).json()
        self.checkpoint({**self.state, "cards": []})
        response = self.client.post("/api/workspace/restore", json={"workspace_id": workspace_id, "snapshot_id": oldest, **reserved})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["cards"], self.state["cards"])

    def test_last_checkpoint_ahead_of_object_sync_reconciles_database(self):
        info = self.client.get("/api/workspace/current").json()
        response = self.client.post("/api/workspace/draft", json={**self.state,
            "workspace_id": info["workspace_id"], "base_revision": 0, "force": True})
        self.assertEqual(response.status_code, 200, response.text)
        loaded = self.client.get("/api/workspace/current").json()
        self.assertEqual(loaded["cards"], self.state["cards"])
        self.assertEqual(storage.load_data_from_disk()["cards"], self.state["cards"])
        self.assertEqual(loaded["draft_client_revision"], 0)

    def test_inline_images_are_stored_once_and_restored_as_local_resources(self):
        import base64
        inline = "data:image/png;base64," + base64.b64encode(b"inline-original").decode()
        workspace_id, snapshot_id = self.checkpoint({**self.state, "cards": [{**self.state["cards"][0], "image": inline}]})
        record = draft_store.read_snapshot(workspace_id, snapshot_id)
        self.assertNotIn(inline, json.dumps(record))
        restored = self.client.post("/api/workspace/restore", json={"workspace_id": workspace_id, "snapshot_id": snapshot_id}).json()
        image = restored["cards"][0]["image"]
        self.assertTrue(image.startswith("/api/assets/"))
        self.assertEqual((self.data / "assets" / image.rsplit("/", 1)[1]).read_bytes(), b"inline-original")

    def test_disabled_autosave_still_allows_explicit_final_checkpoint(self):
        self.client.patch("/api/settings/files", json={"autosave_enabled": False})
        info = self.client.get("/api/workspace/current").json()
        payload = {**self.state, "workspace_id": info["workspace_id"], "base_revision": 0}
        self.assertTrue(self.client.post("/api/workspace/draft", json=payload).json()["disabled"])
        self.assertTrue(self.client.post("/api/workspace/draft", json={**payload, "force": True}).json()["success"])

    def test_packaged_default_uses_executable_directory_instead_of_extraction(self):
        executable = self.root / "portable" / "DropIt.exe"
        with patch.dict(os.environ, {"PINBOARD_APP_ROOT": ""}), \
             patch.object(file_settings.sys, "frozen", True, create=True), \
             patch.object(file_settings.sys, "executable", str(executable)), \
             patch.object(file_settings.sys, "_MEIPASS", str(self.root / "ephemeral"), create=True):
            self.assertEqual(Path(file_settings.default_file_directories()["save_dir"]), executable.parent / "Files" / "Save")

    def test_legacy_defaults_upgrade_and_preserve_recovery_records(self):
        workspace_id, snapshot_id = self.checkpoint()
        old_temp = self.root / "app" / "Files" / "Temp"
        Path(self.options["temp_dir"]).rename(old_temp)
        data_paths.update_config({"file_settings": {**file_settings.RECOVERY_DEFAULTS,
            "save_dir": str(old_temp.parent), "temp_dir": str(old_temp)}, "file_directory_defaults": {}})
        upgraded = self.client.get("/api/settings/files").json()
        self.assertEqual(upgraded["save_dir"], self.options["save_dir"])
        self.assertEqual(upgraded["temp_dir"], self.options["temp_dir"])
        relative = Path(workspace_id) / "snapshots" / f"{snapshot_id}.json"
        self.assertEqual((old_temp / relative).read_bytes(), (Path(upgraded["temp_dir"]) / relative).read_bytes())
        self.assertEqual(self.client.get("/api/workspace/current").json()["cards"], self.state["cards"])

    def test_legacy_upgrade_failure_keeps_previous_address_and_reports_error(self):
        workspace_id, snapshot_id = self.checkpoint()
        old_temp = self.root / "app" / "Files" / "Temp"
        Path(self.options["temp_dir"]).rename(old_temp)
        old_settings = {**file_settings.RECOVERY_DEFAULTS, "save_dir": str(old_temp.parent), "temp_dir": str(old_temp)}
        data_paths.update_config({"file_settings": old_settings, "file_directory_defaults": {}})
        with patch.object(file_settings, "_copy_recoveries", side_effect=OSError("copy failed")):
            result = self.client.get("/api/settings/files").json()
        self.assertEqual(result["temp_dir"], str(old_temp))
        self.assertIn("migration_error", result)
        self.assertEqual(data_paths.get_config()["file_settings"], old_settings)
        self.assertTrue((old_temp / workspace_id / "snapshots" / f"{snapshot_id}.json").is_file())

    def test_default_directories_follow_a_moved_app_and_keep_the_latest_draft(self):
        workspace_id, snapshot_id = self.checkpoint()
        with patch.dict(os.environ, {"PINBOARD_APP_ROOT": str(self.root / "moved-app")}):
            moved = self.client.get("/api/settings/files").json()
            self.assertEqual(Path(moved["save_dir"]), self.root / "moved-app" / "Files" / "Save")
            self.assertTrue((Path(moved["temp_dir"]) / workspace_id / "snapshots" / f"{snapshot_id}.json").is_file())
            self.assertEqual(self.client.get("/api/workspace/current").json()["workspace_id"], workspace_id)

    def test_custom_file_destinations_are_preserved_when_app_moves(self):
        saved, temporary = self.root / "my-saves", self.root / "my-drafts"
        result = self.client.patch("/api/settings/files", json={"save_dir": str(saved), "temp_dir": str(temporary)})
        self.assertEqual(result.status_code, 200)
        with patch.dict(os.environ, {"PINBOARD_APP_ROOT": str(self.root / "moved-app")}):
            moved = self.client.get("/api/settings/files").json()
        self.assertEqual(Path(moved["save_dir"]), saved)
        self.assertEqual(Path(moved["temp_dir"]), temporary)

    def test_unwritable_application_uses_all_three_folders_in_local_app_data(self):
        writable = file_settings.writable_directory
        def deny_app(path):
            if (self.root / "app") in path.parents:
                raise PermissionError("read only application")
            return writable(path)
        with patch.dict(os.environ, {"LOCALAPPDATA": str(self.root / "local")}), \
             patch.object(file_settings, "writable_directory", side_effect=deny_app):
            options = file_settings.default_file_directories()
        files = self.root / "local" / "InfiniteCanvasNote" / "Files"
        self.assertEqual(Path(options["save_dir"]), files / "Save")
        self.assertEqual(Path(options["temp_dir"]), files / "Temporary")
        self.assertEqual(sorted(path.name for path in files.iterdir()), ["Save", "Template", "Temporary"])


if __name__ == "__main__":
    unittest.main()
