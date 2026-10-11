"""Opening in an isolated desktop board must preserve both complete workspaces."""
import json
import os
import tempfile
import unittest
import zipfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from backend.routes import settings, workspaces
from backend.services import data_paths, storage
from backend.services.workspace_session import set_session, session_info
from backend.tests.asgi_client import ASGIClient


class OpenBoardTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.current_dir = self.root / 'current'
        self.child_dir = self.root / 'child'
        self.stack.enter_context(patch.dict(os.environ, {
            'PINBOARD_DATA_DIR': str(self.current_dir), 'PINBOARD_APP_ROOT': str(self.root / 'app'),
            'PINBOARD_NEW_BOARD': '1',
        }))
        self.stack.enter_context(patch.object(data_paths, 'CONFIG_DIR', self.root / 'config'))
        self.stack.enter_context(patch.object(data_paths, 'CONFIG_FILE', self.root / 'config/config.json'))
        self.stack.enter_context(patch.object(storage, 'LEGACY_DATA_DIR', self.root / 'legacy'))
        app = FastAPI()
        app.include_router(settings.router)
        app.include_router(workspaces.router)
        self.client = ASGIClient(app)
        self.original = {
            'cards': [{'id': 'old', 'type': 'text', 'content': 'Unsaved content', 'title': 'Old title',
                       'image': '/api/assets/same.png', 'parentId': 'origin'}],
            'groups': [{'id': 'origin', 'kind': 'parent', 'title': 'Origin', 'x': 10, 'y': 20}],
            'viewport': {'x': 123, 'y': -45, 'zoom': .8},
            'pins': [{'id': 'pin-old', 'index': 1, 'x': 7, 'y': 8}],
        }
        storage.force_replace_all(self.original)
        (self.current_dir / 'assets/same.png').write_bytes(b'original-image')
        self.source = self.root / 'current.drop'
        set_session({**session_info(), 'source_path': str(self.source), 'initialized': True})
        self.before = self.client.get('/api/workspace/current').json()
        self.incoming = {
            'cards': [{'id': 'one', 'type': 'text', 'title': 'First', 'content': 'First text'},
                      {'id': 'two', 'type': 'image', 'image': '/api/assets/same.png', 'bundleId': 'bundle'}],
            'groups': [{'id': 'bundle', 'kind': 'bundle', 'collapsed': True, 'title': 'Bundle'}],
            'viewport': {'x': -300, 'y': 90, 'zoom': .5},
            'pins': [{'id': 'pin-new', 'index': 2, 'x': 70, 'y': 80}],
        }
        self.target = self.root / 'incoming.drop'
        with zipfile.ZipFile(self.target, 'w') as archive:
            archive.writestr('meta.json', json.dumps(self.incoming))
            archive.writestr('assets/same.png', b'incoming-image')

    def test_open_refresh_and_save_are_isolated_from_the_original_complete_board(self):
        with patch.dict(os.environ, {'PINBOARD_DATA_DIR': str(self.child_dir)}), patch.object(
                settings, 'choose_existing_drop_file', return_value=self.target):
            result = self.client.post('/api/storage/open', json={})
            self.assertEqual(result.status_code, 200, result.text)
            for _ in range(2):  # Initial load and F5 both read the child's full state.
                loaded = self.client.get('/api/workspace/current').json()
                for key in ('cards', 'groups', 'viewport', 'pins'):
                    self.assertEqual(loaded[key], self.incoming[key])
            self.assertNotEqual(loaded['workspace_id'], self.before['workspace_id'])
            self.assertEqual((self.child_dir / 'assets/same.png').read_bytes(), b'incoming-image')
            changed = {**self.incoming, 'cards': [{**self.incoming['cards'][0], 'content': 'Child edit'},
                                               self.incoming['cards'][1]]}
            saved = self.client.post('/api/storage/save', json=changed)
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertEqual(saved.json()['path'], str(self.target))
        self.assertEqual(self.client.get('/api/workspace/current').json(), self.before)
        self.assertEqual((self.current_dir / 'assets/same.png').read_bytes(), b'original-image')
        with zipfile.ZipFile(self.target) as archive:
            self.assertEqual(json.loads(archive.read('meta.json'))['cards'][0]['content'], 'Child edit')
            self.assertEqual(archive.read('assets/same.png'), b'incoming-image')

    def test_cancelled_or_invalid_open_leaves_both_the_original_and_blank_child_intact(self):
        with patch.dict(os.environ, {'PINBOARD_DATA_DIR': str(self.child_dir)}):
            with patch.object(settings, 'choose_existing_drop_file', return_value=None):
                result = self.client.post('/api/storage/open', json={})
                self.assertEqual(result.json(), {'success': False, 'cancelled': True})
            corrupt = self.root / 'corrupt.drop'
            corrupt.write_bytes(b'not an archive')
            with patch.object(settings, 'choose_existing_drop_file', return_value=corrupt):
                self.assertEqual(self.client.post('/api/storage/open', json={}).status_code, 400)
            blank = self.client.get('/api/workspace/current').json()
            self.assertEqual(blank['cards'], [])
            self.assertEqual(blank['groups'], [])
        self.assertEqual(self.client.get('/api/workspace/current').json(), self.before)

    def test_later_windows_remember_the_last_successful_open_without_changing_the_parent_save_path(self):
        with patch.dict(os.environ, {'PINBOARD_DATA_DIR': str(self.child_dir)}), patch.object(
                settings, 'choose_existing_drop_file', return_value=self.target):
            self.assertEqual(self.client.post('/api/storage/open', json={}).status_code, 200)
        self.assertEqual(settings._current_drop_path(), self.source)
        with patch.dict(os.environ, {'PINBOARD_DATA_DIR': str(self.root / 'another-child')}), patch.object(
                settings, 'choose_existing_drop_file', return_value=None) as picker:
            self.client.post('/api/storage/open', json={})
            picker.assert_called_once_with(self.target)


if __name__ == '__main__':
    unittest.main()
