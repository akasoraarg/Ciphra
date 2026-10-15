"""macOS Keychain contract tests; no actual credentials or platform calls."""
import json
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'desktop'))
import keychain


class DesktopKeyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.enterContext(patch.object(keychain.sys, 'platform', 'darwin'))
        self.run = self.enterContext(patch.object(keychain.subprocess, 'run'))
        self.keys = {'VAULT_KEY': 'synthetic-saved-vault', 'CIPHRA_BASE_KEY': 'synthetic-saved-base'}

    def response(self, status=0, content=''):
        return subprocess.CompletedProcess([], status, stdout=content, stderr='')

    def test_first_launch_persists_and_next_launch_reuses_keys(self):
        self.run.side_effect = [self.response(44), self.response()]
        with patch.object(keychain.secrets, 'token_urlsafe', side_effect=list(self.keys.values())):
            env = keychain.encryption_environment({}, self.root)
        self.assertEqual(env, self.keys)
        self.assertEqual(json.loads(self.run.call_args.args[0][-1]), self.keys)
        self.run.reset_mock(side_effect=True)
        self.run.return_value = self.response(content=json.dumps(self.keys))
        self.assertEqual(keychain.encryption_environment({}, self.root), env)
        self.run.assert_called_once()
        self.assertIn('find-generic-password', self.run.call_args.args[0])
        self.assertEqual(list(self.root.iterdir()), [])

    def test_explicit_keys_preserve_legacy_configuration(self):
        env = {'VAULT_KEY': 'explicit-vault', 'GEMINI_API_KEY': 'explicit-provider-key'}
        self.assertEqual(keychain.encryption_environment(env, self.root), env)
        self.run.assert_not_called()

    def test_keychain_read_failure_does_not_generate_or_overwrite(self):
        self.run.return_value = self.response(36)
        with self.assertRaisesRegex(RuntimeError, 'Could not read'):
            keychain.encryption_environment({}, self.root)
        self.run.assert_called_once()

    def test_keychain_write_failure_aborts_first_launch(self):
        self.run.side_effect = [self.response(44), self.response(1)]
        with self.assertRaisesRegex(RuntimeError, 'Could not store'):
            keychain.encryption_environment({}, self.root)

    def test_malformed_saved_keys_are_not_replaced(self):
        for content in ('not json', '[]', '{}', '{"VAULT_KEY": 4, "CIPHRA_BASE_KEY": "test"}'):
            with self.subTest(content=content):
                self.run.reset_mock()
                self.run.return_value = self.response(content=content)
                with self.assertRaisesRegex(RuntimeError, 'invalid'):
                    keychain.encryption_environment({}, self.root)
                self.run.assert_called_once()

    def test_existing_data_requires_original_keys(self):
        (self.root / 'users.json').write_text('{"synthetic": true}')
        self.run.return_value = self.response(44)
        with self.assertRaisesRegex(RuntimeError, 'original encryption keys'):
            keychain.encryption_environment({}, self.root)
        self.run.assert_called_once()

    def test_partial_configuration_is_filled_without_changing_external_key(self):
        self.run.return_value = self.response(content=json.dumps(self.keys))
        env = keychain.encryption_environment({'VAULT_KEY': 'explicit-vault', 'CIPHRA_BASE_KEY': ''}, self.root)
        self.assertEqual(env, {**self.keys, 'VAULT_KEY': 'explicit-vault'})

    def test_desktop_passes_restored_keys_to_backend(self):
        path = Path(__file__).resolve().parent.parent / 'desktop/desktop.py'
        spec = importlib.util.spec_from_file_location('desktop_launch_test', path)
        app = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'webview': SimpleNamespace()}):
            spec.loader.exec_module(app)
        with patch.object(app, 'encryption_environment', return_value=self.keys) as restore, \
                patch.object(app.subprocess, 'Popen') as launch, \
                patch.object(app.os.path, 'exists', return_value=False):
            app.start_server()
        restore.assert_called_once()
        self.assertEqual(launch.call_args.kwargs['env'], self.keys)
        self.assertIn('--app-dir', launch.call_args.args[0])
