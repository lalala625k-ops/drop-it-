import io
import json
import os
import tempfile
import unittest
import zipfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from backend.routes import cards, settings
from backend.services import storage, data_paths
from backend.services.draft_store import write_snapshot, latest_snapshot


class FileSourcePersistenceTests(unittest.TestCase):
    def test_reference_survives_sqlite_draft_and_drop_without_copying_original(self):
        with ExitStack() as stack:
            root = Path(stack.enter_context(tempfile.TemporaryDirectory()))
            data = root / 'data'
            stack.enter_context(patch.dict(os.environ, {'PINBOARD_DATA_DIR': str(data), 'PINBOARD_NEW_BOARD': '1'}))
            stack.enter_context(patch.object(data_paths, 'CONFIG_DIR', root / 'config'))
            stack.enter_context(patch.object(data_paths, 'CONFIG_FILE', root / 'config' / 'config.json'))
            source = root / 'document.pdf'; source.write_bytes(b'original document')
            card = cards.CardModel(id='file-card', type='file', x=10, y=20, width=360, height=280, zIndex=1,
                image='/api/assets/shot.png', thumbnail='/api/assets/shot.webp',
                fileSource={'path': str(source), 'name': source.name, 'linkedBy': 'detected', 'app': 'WPS PDF'})
            result = cards.save_cards(cards.PersistencePayload(cards=[card], groups=[], baseRevision=0))
            self.assertTrue(result['success'])
            loaded = storage.load_data_from_disk()['cards'][0]
            self.assertEqual(loaded['fileSource']['path'], str(source))
            self.assertEqual(loaded['thumbnail'], card.thumbnail)
            (data / 'assets' / 'shot.png').write_bytes(b'screenshot pixels')
            (data / 'assets' / 'shot.webp').write_bytes(b'thumbnail pixels')
            with patch('backend.services.draft_store.get_file_settings', return_value={
                    'temp_dir': str(root / 'drafts'), 'retention_count': 5}):
                info = {'workspace_id': 'a' * 32, 'source_path': None}
                state = {'cards': [loaded], 'groups': [], 'viewport': {'x': 0, 'y': 0, 'zoom': 1}, 'pins': []}
                write_snapshot(info, state, 1, 1)
                self.assertEqual(latest_snapshot(info['workspace_id'])['state']['cards'][0]['fileSource'], loaded['fileSource'])
            # Real archive exporter stores references as metadata, not source bytes.
            for name, path in [('get_assets_dir', data / 'assets'), ('get_screenshots_dir', data / 'screenshots')]:
                stack.enter_context(patch.object(settings, name, return_value=path))
            payload = settings.ArchiveExportPayload(cards=[loaded], groups=[])
            archive_bytes = settings._build_drop_bytes(payload)
            with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
                metadata = json.loads(archive.read('meta.json'))
                self.assertEqual(metadata['cards'][0]['fileSource'], loaded['fileSource'])
                self.assertNotIn('document.pdf', archive.namelist())
                self.assertNotIn(b'original document', archive_bytes)
            self.assertEqual(source.read_bytes(), b'original document')


if __name__ == '__main__': unittest.main()
