import base64
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from PIL import Image
from desktop.file_sources import SourceStore, reference, local_file, verified_crop
from desktop.file_source_api import FileSourceApi
from desktop.screenshot_sources import ScreenshotSources
from desktop.source_probe_client import DocumentProbe


def png(image):
    stream = io.BytesIO(); image.save(stream, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()


class FileSourceTests(unittest.TestCase):
    def test_matching_requires_same_pixels_sequence_and_fresh_record(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / '原文件.pdf'; target.write_bytes(b'sample')
            clock = [10]
            store = SourceStore(clock=lambda: clock[0])
            image = Image.new('RGB', (10, 6), 'blue')
            source = reference(str(target), app='WPS PDF')
            store.bind(image, source, 7)
            self.assertEqual(store.match(png(image), 7), source)
            self.assertIsNone(store.match(png(image), 8))
            self.assertIsNone(store.match(png(Image.new('RGB', (10, 6), 'red')), 7))
            clock[0] = 311
            self.assertIsNone(store.match(png(image), 7))
            store.bind(image, source, 9); target.unlink()
            self.assertIsNone(store.match(png(image), 9))

    def test_cancel_and_foreign_clipboard_cannot_reuse_source(self):
        store = SourceStore(); image = Image.new('RGB', (4, 4))
        store.bind(image, {'path': 'C:/source.pdf'}, 1); store.clear()
        self.assertIsNone(store.match(png(image), 1))
        self.assertIsNone(store.match('data:image/png;base64,invalid', 1))
        self.assertIsNone(store.match('http://example.com/image.png', 1))

    def test_crop_checks_origin_pixels_bounds_and_covering_windows(self):
        screen = Image.new('RGB', (100, 80), 'blue')
        selection = (-190, 20, -170, 30)
        crop = screen.crop((10, 20, 31, 31))
        args = (screen, (-200, 0), selection, (-200, 0, -100, 80))
        self.assertTrue(verified_crop(*args, [], crop))
        self.assertFalse(verified_crop(*args, [(-180, 21, -160, 40)], crop))
        self.assertFalse(verified_crop(*args, [], Image.new('RGB', crop.size, 'red')))
        self.assertFalse(verified_crop(screen, (-200, 0), (-210, 20, -170, 30), args[3], [], crop))

    def test_opening_rejects_missing_files_urls_executables_and_network_paths(self):
        for path in ['relative.pdf', '/rooted.pdf', 'https://example.com', '\\\\server\\share\\doc.pdf',
                     'C:/source.exe', 'C:/source.py', 'C:/source.reg', 'C:/doc.pdf:stream', 'C:/missing.pdf', 'C:/x\0.pdf']:
            with self.subTest(path=path), self.assertRaises(ValueError): local_file(path)
        bridge = FileSourceApi()
        with patch('desktop.file_source_api.os.startfile', create=True) as launch:
            self.assertFalse(bridge.open_source_file('C:/missing.pdf')['success'])
            launch.assert_not_called()

    def test_native_open_preserves_source_reference_and_does_not_copy_file(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'source.psd'; target.write_bytes(b'original')
            with patch('desktop.file_source_api.os.startfile', create=True) as launch:
                self.assertTrue(FileSourceApi().open_source_file(str(target))['success'])
                launch.assert_called_once_with(str(target.resolve()))
            self.assertEqual(list(Path(folder).iterdir()), [target])
            self.assertEqual(target.read_bytes(), b'original')

    def test_clipboard_burst_binds_only_the_final_sequence(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'source.pdf'; target.write_bytes(b'sample')
            image = Image.new('RGB', (20, 10), 'blue')
            observer = ScreenshotSources()
            observer._probe = MagicMock()
            observer._windows = MagicMock()
            observer._windows.u.GetClipboardSequenceNumber.return_value = 2
            observer._windows.dib_image.return_value = image
            pending = {'source': reference(str(target)), 'screen': Image.new('RGB', (40, 30), 'blue'),
                'origin': (0, 0), 'selection': (5, 5, 25, 15), 'rect': (0, 0, 40, 30),
                'obstructions': [], 'sequence': 2}
            observer._pending = pending
            observer._tasks.put(('image', pending, 1))
            observer._tasks.put(('image', pending, 2))
            observer._tasks.put(None)
            with patch('desktop.screenshot_sources.time.sleep'):
                observer._work()
            self.assertIsNone(observer._store.match(png(image), 1))
            self.assertEqual(observer._store.match(png(image), 2)['path'], str(target.resolve()))
            self.assertIsNone(observer._pending)

    def test_stopped_helper_cannot_restart_and_ready_requires_hooks(self):
        probe = DocumentProbe(); probe.stop()
        with patch('desktop.source_probe_client.subprocess.Popen') as spawn:
            self.assertIsNone(probe.read(1))
            with self.assertRaises(RuntimeError): probe.start()
            spawn.assert_not_called()
        observer = ScreenshotSources(); observer._probe_ready = True
        self.assertEqual(observer.status()['state'], 'starting')
        observer._listener_ready = True
        self.assertEqual(observer.status()['state'], 'ready')
        observer.stop()
        self.assertNotEqual(observer.status()['state'], 'ready')


if __name__ == '__main__': unittest.main()
