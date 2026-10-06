import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from desktop import dev_server


class ViteReadinessTests(unittest.TestCase):
    def test_checks_ipv4_vite_client_instead_of_an_open_port(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.read.return_value = b'export function createHotContext() {}'
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(dev_server.urllib.request, 'build_opener', return_value=opener):
            self.assertTrue(dev_server.vite_available())
        opener.open.assert_called_once_with('http://127.0.0.1:5173/@vite/client', timeout=0.8)

    def test_a_static_site_on_the_same_port_is_not_vite(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.read.return_value = b'<!doctype html><html>Saved application</html>'
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(dev_server.urllib.request, 'build_opener', return_value=opener):
            self.assertFalse(dev_server.vite_available())

    def test_existing_ready_vite_is_reused_without_ownership(self):
        with patch.object(dev_server, 'vite_available', return_value=True), \
             patch.object(dev_server.subprocess, 'Popen') as launch:
            self.assertIsNone(dev_server.ensure_vite_server(Path('frontend')))
        launch.assert_not_called()


class ViteStartupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.frontend = Path(self.directory.name)
        vite = self.frontend / 'node_modules/vite/bin/vite.js'
        vite.parent.mkdir(parents=True)
        vite.write_text('// fixture', encoding='utf-8')
        self.log = self.frontend / 'logs/vite.log'

    def test_waits_for_http_readiness_and_launches_node_on_ipv4(self):
        process = MagicMock()
        process.poll.return_value = None
        with patch.object(dev_server, 'vite_available', side_effect=[False, False, True]), \
             patch.object(dev_server.shutil, 'which', return_value='node.exe'), \
             patch.object(dev_server.subprocess, 'Popen', return_value=process) as launch, \
             patch.object(dev_server.time, 'sleep'):
            self.assertIs(dev_server.ensure_vite_server(self.frontend, log_path=self.log), process)
        command = launch.call_args.args[0]
        self.assertEqual(command[2:], ['--host', '127.0.0.1', '--port', '5173', '--strictPort'])
        self.assertEqual(launch.call_args.kwargs['cwd'], str(self.frontend))
        self.assertFalse(launch.call_args.kwargs.get('shell', False))
        process.terminate.assert_not_called()

    def test_timeout_stops_the_owned_process(self):
        process = MagicMock()
        process.poll.return_value = None
        with patch.object(dev_server, 'vite_available', return_value=False), \
             patch.object(dev_server.shutil, 'which', return_value='node.exe'), \
             patch.object(dev_server.subprocess, 'Popen', return_value=process), \
             patch.object(dev_server.time, 'monotonic', side_effect=[0, 2]):
            with self.assertRaisesRegex(RuntimeError, '未能.*就绪'):
                dev_server.ensure_vite_server(self.frontend, timeout=1, log_path=self.log)
        process.terminate.assert_called_once()
        process.wait.assert_called_once_with(timeout=3)

    def test_new_board_frontend_proxies_to_its_own_backend(self):
        process = MagicMock()
        process.poll.return_value = None
        with patch.object(dev_server, 'vite_available', side_effect=[False, True]), \
             patch.object(dev_server.shutil, 'which', return_value='node.exe'), \
             patch.object(dev_server.subprocess, 'Popen', return_value=process) as launch:
            dev_server.ensure_vite_server(self.frontend, port=24517, log_path=self.log,
                                          backend_url='http://127.0.0.1:24518')
        self.assertEqual(launch.call_args.args[0][-3:], ['--port', '24517', '--strictPort'])
        self.assertEqual(launch.call_args.kwargs['env']['PINBOARD_VITE_BACKEND_URL'],
                         'http://127.0.0.1:24518')

    def test_default_backend_setting_is_not_changed_in_the_parent_environment(self):
        process = MagicMock()
        process.poll.return_value = None
        with patch.dict(dev_server.os.environ, {'PINBOARD_VITE_BACKEND_URL': 'original'}), \
             patch.object(dev_server, 'vite_available', side_effect=[False, True]), \
             patch.object(dev_server.shutil, 'which', return_value='node.exe'), \
             patch.object(dev_server.subprocess, 'Popen', return_value=process) as launch:
            dev_server.ensure_vite_server(self.frontend, log_path=self.log,
                                          backend_url='http://127.0.0.1:24518')
            self.assertEqual(dev_server.os.environ['PINBOARD_VITE_BACKEND_URL'], 'original')
            self.assertEqual(launch.call_args.kwargs['env']['PINBOARD_VITE_BACKEND_URL'],
                             'http://127.0.0.1:24518')

    def test_early_exit_reports_the_log_path(self):
        process = MagicMock()
        process.poll.return_value = 1
        process.returncode = 1
        with patch.object(dev_server, 'vite_available', return_value=False), \
             patch.object(dev_server.shutil, 'which', return_value='node.exe'), \
             patch.object(dev_server.subprocess, 'Popen', return_value=process):
            with self.assertRaises(RuntimeError) as error:
                dev_server.ensure_vite_server(self.frontend, log_path=self.log)
        self.assertIn(str(self.log), str(error.exception))
        self.assertIn('退出码 1', str(error.exception))

    def test_missing_node_is_reported_before_launch(self):
        with patch.object(dev_server, 'vite_available', return_value=False), \
             patch.object(dev_server.shutil, 'which', return_value=None), \
             patch.object(dev_server.subprocess, 'Popen') as launch:
            with self.assertRaisesRegex(RuntimeError, 'Node.js'):
                dev_server.ensure_vite_server(self.frontend, log_path=self.log)
        launch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
