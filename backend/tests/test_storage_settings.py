import importlib
import os
import tempfile
import unittest
import zipfile
import io
from pathlib import Path
from unittest.mock import patch

from backend.routes import settings
from backend.routes.settings import DropSavePayload
from backend.services import data_paths


class StorageSaveTests(unittest.TestCase):
    def test_saved_drop_contains_only_referenced_resources(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            assets = root / "assets"
            screenshots = root / "screenshots"
            assets.mkdir()
            screenshots.mkdir()
            (assets / "used.png").write_bytes(b"used-image")
            (assets / "deleted.png").write_bytes(b"deleted-image" * 100)
            (screenshots / "used.jpg").write_bytes(b"used-screenshot")
            (screenshots / "deleted.jpg").write_bytes(b"deleted-screenshot" * 100)
            payload = DropSavePayload(
                cards=[
                    {"id": "image", "type": "image", "image": "/api/assets/used.png"},
                    {"id": "web", "type": "web", "image": "/api/screenshots/used.jpg"},
                    # Remote URLs must not be treated as local resources.
                    {"id": "remote", "type": "web", "image": "https://example.test/assets/deleted.png"},
                ],
                groups=[],
            )

            with patch.object(settings, "get_assets_dir", return_value=assets), \
                 patch.object(settings, "get_screenshots_dir", return_value=screenshots):
                raw = settings._build_drop_bytes(payload)

            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                self.assertEqual(
                    sorted(archive.namelist()),
                    ["assets/used.png", "meta.json", "screenshots/used.jpg"],
                )

    def test_save_removes_unreferenced_resources_from_workspace(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data_dir = root / "data"
            assets = data_dir / "assets"
            screenshots = data_dir / "screenshots"
            assets.mkdir(parents=True)
            screenshots.mkdir()
            (assets / "used.png").write_bytes(b"used")
            (assets / "deleted.png").write_bytes(b"deleted")
            (screenshots / "deleted.jpg").write_bytes(b"deleted")
            target = root / "saved.drop"
            config = {
                "drop_file_path": str(target),
                "drop_storage_dir": str(data_dir.resolve()),
            }
            payload = DropSavePayload(
                cards=[{"id": "image", "type": "image", "image": "/api/assets/used.png"}],
                groups=[],
            )

            with patch.object(settings, "get_data_dir", return_value=data_dir), \
                 patch.object(settings, "get_assets_dir", return_value=assets), \
                 patch.object(settings, "get_screenshots_dir", return_value=screenshots), \
                 patch.object(settings, "get_config", return_value=config), \
                 patch.object(settings, "update_config"):
                result = settings.save_drop_file(payload)

            self.assertTrue(result["success"])
            self.assertTrue((assets / "used.png").exists())
            self.assertFalse((assets / "deleted.png").exists())
            self.assertFalse((screenshots / "deleted.jpg").exists())
            with zipfile.ZipFile(target) as archive:
                self.assertEqual(archive.namelist(), ["meta.json", "assets/used.png"])

    def test_first_save_prompts_then_remembers_path(self):
        with tempfile.TemporaryDirectory() as temp:
            data_dir = Path(temp) / "data"
            target = Path(temp) / "boards" / "first.drop"
            config: dict[str, str] = {}

            with patch.object(settings, "get_data_dir", return_value=data_dir), \
                 patch.object(settings, "get_config", side_effect=lambda: config), \
                 patch.object(settings, "update_config", side_effect=lambda value: config.update(value)), \
                 patch.object(settings, "choose_drop_file", return_value=target) as choose, \
                 patch.object(settings, "_build_drop_bytes", return_value=b"first"), \
                 patch.object(settings, "_prune_unreferenced_resources"):
                result = settings.save_drop_file(DropSavePayload(cards=[], groups=[]))

                self.assertTrue(result["success"])
                choose.assert_called_once()
                self.assertEqual(target.read_bytes(), b"first")
                self.assertEqual(config["drop_file_path"], str(target))
                self.assertEqual(config["drop_storage_dir"], str(data_dir.resolve()))

                choose.reset_mock()
                result = settings.save_drop_file(DropSavePayload(cards=[], groups=[]))
                self.assertTrue(result["success"])
                choose.assert_not_called()

                settings.save_drop_file(DropSavePayload(cards=[], groups=[], save_as=True))
                choose.assert_called_once()

    def test_cancelled_first_save_writes_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            data_dir = Path(temp) / "data"
            config: dict[str, str] = {}
            with patch.object(settings, "get_data_dir", return_value=data_dir), \
                 patch.object(settings, "get_config", side_effect=lambda: config), \
                 patch.object(settings, "choose_drop_file", return_value=None), \
                 patch.object(settings, "_build_drop_bytes", return_value=b"should-not-write"):
                result = settings.save_drop_file(DropSavePayload(cards=[], groups=[]))

            self.assertEqual(result, {"success": False, "cancelled": True})
            self.assertEqual(list(Path(temp).rglob("*")), [])
            self.assertEqual(config, {})


class ConfigDirectoryTests(unittest.TestCase):
    def test_config_directory_can_be_isolated_by_environment(self):
        previous = os.environ.get("PINBOARD_CONFIG_DIR")
        with tempfile.TemporaryDirectory() as temp:
            try:
                os.environ["PINBOARD_CONFIG_DIR"] = temp
                importlib.reload(data_paths)
                self.assertEqual(data_paths.CONFIG_DIR, Path(temp).resolve())
                data_paths.save_config({"sandbox": True})
                self.assertEqual(data_paths.get_config(), {"sandbox": True})
            finally:
                if previous is None:
                    os.environ.pop("PINBOARD_CONFIG_DIR", None)
                else:
                    os.environ["PINBOARD_CONFIG_DIR"] = previous
                importlib.reload(data_paths)


if __name__ == "__main__":
    unittest.main()
