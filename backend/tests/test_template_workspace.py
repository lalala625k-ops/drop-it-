import asyncio
import json
import os
import tempfile
import unittest
import zipfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from backend.routes import settings
from backend.services import template_paths, data_paths, file_settings
from backend.services.file_settings import get_file_settings
from scripts import build_dropit_installer as packaging


class TemplateWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.data = self.root / "data"
        self.stack.enter_context(patch.dict(os.environ, {"PINBOARD_DATA_DIR": str(self.data), "PINBOARD_APP_ROOT": str(self.root / "app")}))
        self.stack.enter_context(patch.object(data_paths, "CONFIG_DIR", self.root / "config"))
        self.stack.enter_context(patch.object(data_paths, "CONFIG_FILE", self.root / "config" / "config.json"))
        self.template = self.root / "app" / "Files" / "Template" / "Template一.drop"
        self.template.parent.mkdir(parents=True)
        self.meta = {
            "cards": [{"id": "example", "type": "image", "image": "/api/assets/example.png"}],
            "groups": [],
            "viewport": {"x": 100, "y": 200, "zoom": 0.6},
            "pins": [{"id": "pin-1", "index": 1, "x": 0, "y": 0}],
        }
        with zipfile.ZipFile(self.template, "w") as archive:
            archive.writestr("meta.json", json.dumps(self.meta))
            archive.writestr("assets/example.png", b"example-image")
        self.config = {}
        for name, value in (
            ("get_data_dir", self.data), ("get_assets_dir", self.data / "assets"),
            ("get_screenshots_dir", self.data / "screenshots"),
            ("get_template_path", self.template), ("get_config", self.config),
        ):
            self.stack.enter_context(patch.object(settings, name, return_value=value))
        self.stack.enter_context(patch.dict(os.environ, {"PINBOARD_NEW_BOARD": "0", "PINBOARD_RELEASE_EMPTY": "0"}))

    def test_first_load_restores_the_example_and_its_media(self):
        original = self.template.read_bytes()
        result = asyncio.run(settings.load_drop_file())
        self.assertTrue(result["success"])
        self.assertTrue(result["is_template"])
        for name in ("cards", "groups", "viewport", "pins"):
            self.assertEqual(result[name], self.meta[name])
        self.assertEqual((self.data / "assets/example.png").read_bytes(), b"example-image")
        self.assertEqual((self.data / "board.drop").read_bytes(), original)
        self.assertEqual(self.template.read_bytes(), original)
        self.assertEqual(list(self.template.parent.iterdir()), [self.template])

    def test_first_open_dialog_points_at_the_template_directory(self):
        with patch.object(settings, "choose_existing_drop_file", return_value=None) as choose:
            self.assertEqual(settings.open_drop_file(), {"success": False, "cancelled": True})
        choose.assert_called_once_with(self.template)
        self.assertEqual(self.config, {})

    def test_remembered_user_file_is_used_for_later_open_dialogs(self):
        user_file = self.root / "notes" / "saved.drop"
        self.config.update(drop_file_path=str(user_file), drop_storage_dir=str(self.data.resolve()),
                           drop_open_storage_dir=str(self.data.resolve()))
        with patch.object(settings, "choose_existing_drop_file", return_value=None) as choose:
            settings.open_drop_file()
        choose.assert_called_once_with(user_file.resolve())
        self.assertFalse(settings._install_project_template())
        self.assertFalse(user_file.exists())

    def test_first_open_still_uses_template_after_saving_a_user_file(self):
        self.config.update(drop_file_path=str(self.root / "saved.drop"), drop_storage_dir=str(self.data.resolve()))
        with patch.object(settings, "choose_existing_drop_file", return_value=None) as choose:
            settings.open_drop_file()
        choose.assert_called_once_with(self.template)

    def test_opening_the_example_requires_a_new_file_for_first_save(self):
        original = self.template.read_bytes()
        self.config.update(drop_file_path=str(self.root / "previous.drop"), drop_storage_dir=str(self.data.resolve()))
        with patch.object(settings, "choose_existing_drop_file", return_value=self.template), \
             patch.object(settings, "force_replace_all", return_value=1), \
             patch.object(settings, "update_config"):
            result = settings.open_drop_file()
        self.assertTrue(result["success"])
        self.assertFalse(settings._has_explicit_drop_path())
        with patch.object(settings, "choose_drop_file", return_value=None) as choose:
            settings.save_drop_file(settings.DropSavePayload(cards=[], groups=[]))
        choose.assert_called_once_with(Path(get_file_settings()["save_dir"]) / "board.drop")
        self.assertEqual(self.template.read_bytes(), original)
        self.assertEqual(list(self.template.parent.iterdir()), [self.template])

    def test_existing_workspaces_and_new_boards_are_not_replaced(self):
        self.data.mkdir()
        (self.data / "board.drop").write_bytes(b"existing-user-workspace")
        self.assertFalse(settings._install_project_template())
        self.assertEqual((self.data / "board.drop").read_bytes(), b"existing-user-workspace")
        (self.data / "board.drop").unlink()
        with patch.dict(os.environ, {"PINBOARD_NEW_BOARD": "1"}):
            self.assertFalse(settings._install_project_template())


class TemplateDistributionTests(unittest.TestCase):
    def test_distribution_preserves_runtime_files_by_requiring_a_new_destination(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / "release" / "DropIt-Portable"
            saved = target / "Files" / "Temp" / "snapshot.json"
            saved.parent.mkdir(parents=True)
            saved.write_bytes(b"user draft")
            with patch.object(packaging, "ROOT", root), self.assertRaises(ValueError):
                packaging.assemble_distribution(target, root / "launcher", root / "service", root / "template")
            self.assertEqual(saved.read_bytes(), b"user draft")

    def test_template_path_follows_a_moved_executable(self):
        with tempfile.TemporaryDirectory() as temp:
            for folder in ("original", "moved"):
                executable = Path(temp) / folder / "pinboard-service.exe"
                with patch.object(template_paths.sys, "frozen", True, create=True), \
                     patch.object(template_paths.sys, "executable", str(executable)), \
                     patch.dict(os.environ, {"PINBOARD_APP_ROOT": str(executable.parent)}):
                    self.assertEqual(template_paths.get_template_path(), executable.parent / "Files" / "Template" / "Template一.drop")

    def test_distribution_contains_only_the_designated_template(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            launcher, service, template = (root / name for name in ("launcher.exe", "service.exe", "example.drop"))
            for path in (launcher, service, template):
                path.write_bytes(path.name.encode())
            (root / "other-example.drop").write_bytes(b"must-not-ship")
            target = root / "release" / "portable"
            with patch.object(packaging, "ROOT", root):
                packaging.assemble_distribution(target, launcher, service, template)
                with self.assertRaises(ValueError):
                    packaging.assemble_distribution(root / "outside", launcher, service, template)
            self.assertEqual(sorted(path.name for path in target.iterdir()), ["DropIt.exe", "Files", "pinboard-service.exe"])
            self.assertEqual(sorted(path.name for path in (target / "Files").iterdir()), ["Save", "Template", "Temporary"])
            self.assertEqual([path.name for path in (target / "Files/Template").iterdir()], ["Template一.drop"])
            self.assertEqual((target / "Files/Template/Template一.drop").read_bytes(), template.read_bytes())
            self.assertEqual(list((target / "Files/Save").iterdir()), [])
            self.assertEqual(list((target / "Files/Temporary").iterdir()), [])

    def test_development_template_is_copied_once_into_runtime_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "desktop/Template/Template一.drop"
            source.parent.mkdir(parents=True)
            source.write_bytes(b"bundled example")
            with patch.object(template_paths, "PROJECT_ROOT", root), \
                 patch.dict(os.environ, {"PINBOARD_APP_ROOT": str(root)}):
                target = template_paths.get_template_path()
                self.assertEqual(target, root / "Files/Template/Template一.drop")
                self.assertEqual(target.read_bytes(), b"bundled example")
                target.write_bytes(b"local template")
                self.assertEqual(template_paths.get_template_path().read_bytes(), b"local template")

    def test_legacy_distribution_template_is_copied_without_modifying_original(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "Template/Template一.drop"
            source.parent.mkdir()
            source.write_bytes(b"legacy example")
            with patch.object(template_paths.sys, "frozen", True, create=True), \
                 patch.dict(os.environ, {"PINBOARD_APP_ROOT": str(root)}):
                target = template_paths.get_template_path()
            self.assertEqual(target.read_bytes(), source.read_bytes())
            self.assertEqual(target, root / "Files/Template/Template一.drop")

    def test_readonly_distribution_template_is_available_from_fallback_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            app = root / "readonly-app"
            source = app / "Files/Template/Template一.drop"
            source.parent.mkdir(parents=True)
            source.write_bytes(b"bundled example")
            writable = file_settings.writable_directory
            def deny_app(path):
                if app in path.parents:
                    raise PermissionError("read only application")
                return writable(path)
            with patch.dict(os.environ, {"PINBOARD_APP_ROOT": str(app), "LOCALAPPDATA": str(root / "local")}), \
                 patch.object(template_paths.sys, "frozen", True, create=True), \
                 patch.object(file_settings, "writable_directory", side_effect=deny_app):
                target = template_paths.get_template_path()
            self.assertEqual(target, root / "local/InfiniteCanvasNote/Files/Template/Template一.drop")
            self.assertEqual(target.read_bytes(), source.read_bytes())


if __name__ == "__main__":
    unittest.main()
