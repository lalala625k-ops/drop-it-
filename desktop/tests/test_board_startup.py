import ast
import contextlib
import io
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from desktop.file_source_api import FileSourceApi


class BoardStartupTests(unittest.TestCase):
    def run_startup(self, new_board, vite_ready, open_file=False):
        # Test the real launcher function without opening a window or reading
        # personal storage. All service/window side effects are mocked.
        source = Path(__file__).resolve().parents[1] / 'app.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'start_desktop')
        webview = MagicMock()
        webview.settings = {}
        uvicorn = MagicMock()
        isolated_port = 24518
        namespace = dict(
            sys=SimpleNamespace(argv=['--new-board'] if new_board else [], exit=MagicMock(side_effect=SystemExit(0))),
            os=SimpleNamespace(environ={'PINBOARD_DATA_DIR': 'C:/qa/isolated-board'}),
            IS_FROZEN=False, is_new_board=new_board, PROJECT_ROOT=Path('C:/qa/source'),
            vite_available=MagicMock(return_value=vite_ready),
            find_free_port=MagicMock(side_effect=[isolated_port, 24519]),
            check_backend_alive=MagicMock(return_value=False), wait_for_server=MagicMock(return_value=True),
            ensure_vite_server=MagicMock(return_value=None), threading=MagicMock(),
            WindowApi=MagicMock(), stop_services=MagicMock(), Path=Path, traceback=MagicMock(),
        )
        if open_file:
            namespace['sys'].argv.append('--open-file')
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)
        with patch.dict(sys.modules, {'webview': webview, 'uvicorn': uvicorn}), \
             patch('desktop.close_checkpoint.attach_close_checkpoint'), \
             patch('desktop.file_source_api.attach_file_sources'), \
             contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            namespace['start_desktop']()
        return namespace, uvicorn, webview

    def test_new_development_board_uses_current_source_and_its_own_proxy(self):
        namespace, uvicorn, webview = self.run_startup(True, True)
        self.assertEqual(uvicorn.Config.call_args.kwargs['port'], 24518)
        namespace['ensure_vite_server'].assert_called_once_with(
            Path('C:/qa/source/frontend'), port=24519, backend_url='http://127.0.0.1:24518')
        self.assertEqual(webview.create_window.call_args.kwargs['url'],
                         'http://127.0.0.1:24519/?desktop=1&new-board=1&board-id=isolated-board')

    def test_main_development_board_retains_default_proxy_and_port(self):
        namespace, uvicorn, webview = self.run_startup(False, True)
        self.assertEqual(uvicorn.Config.call_args.kwargs['port'], 8002)
        namespace['find_free_port'].assert_not_called()
        self.assertEqual(webview.create_window.call_args.kwargs['url'], 'http://127.0.0.1:5173/?desktop=1')

    def test_new_board_without_vite_still_uses_its_own_static_backend(self):
        namespace, uvicorn, webview = self.run_startup(True, False)
        namespace['ensure_vite_server'].assert_not_called()
        self.assertEqual(uvicorn.Config.call_args.kwargs['port'], 24518)
        self.assertEqual(webview.create_window.call_args.kwargs['url'],
                         'http://127.0.0.1:24518/?desktop=1&new-board=1&board-id=isolated-board')

    def test_open_file_is_requested_only_in_the_child_window(self):
        for vite_ready in (True, False):
            _, _, webview = self.run_startup(True, vite_ready, open_file=True)
            self.assertTrue(webview.create_window.call_args.kwargs['url'].endswith('&open-file=1'))
        _, _, webview = self.run_startup(False, True, open_file=True)
        self.assertNotIn('open-file', webview.create_window.call_args.kwargs['url'])

    def test_launching_open_keeps_the_existing_window_and_isolates_the_child_directory(self):
        source = Path(__file__).resolve().parents[1] / 'app.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        bridge = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'WindowApi')
        namespace = dict(os=os, sys=SimpleNamespace(executable='C:/qa/python.exe', argv=['--dev']),
            IS_FROZEN=False, PROJECT_ROOT=Path('C:/qa/source'), __file__=str(source),
            uuid=SimpleNamespace(uuid4=lambda: SimpleNamespace(hex='a' * 32)),
            subprocess=MagicMock(), Path=Path, FileSourceApi=FileSourceApi)
        exec(compile(ast.Module(body=[bridge], type_ignores=[]), str(source), 'exec'), namespace)
        api = namespace['WindowApi']()
        api._window = MagicMock()
        with patch.dict(os.environ, {'PINBOARD_DATA_DIR': 'C:/qa/current', 'LOCALAPPDATA': 'C:/qa/local'}):
            api.new_board(True)
            self.assertEqual(os.environ['PINBOARD_DATA_DIR'], 'C:/qa/current')
        api._window.destroy.assert_not_called()
        launched = namespace['subprocess'].Popen.call_args
        self.assertIn('--open-file', launched.args[0])
        self.assertIn('--dev', launched.args[0])
        self.assertNotEqual(launched.kwargs['env']['PINBOARD_DATA_DIR'], 'C:/qa/current')
        self.assertEqual(launched.kwargs['env']['PINBOARD_NEW_BOARD'], '1')


if __name__ == '__main__':
    unittest.main()
