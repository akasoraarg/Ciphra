"""Exercise migration failure paths using synthetic files and encryption keys."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from cryptography.fernet import InvalidToken

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from ciphra_encrypter import CiphraEncrypter
import trigger_encryption


class ReencryptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.paths = [self.root / 'users.json', self.root / 'chats.json']
        self.encrypter = CiphraEncrypter('synthetic-migration-key')
        self.originals = [b'{"operator": {"plan": "free"}}', self.encrypter.encrypt({})]
        for path, content in zip(self.paths, self.originals):
            path.write_bytes(content)

    def test_wrong_key_or_corruption_in_either_file_prevents_all_writes(self):
        invalid = CiphraEncrypter('different-synthetic-key').encrypt({'preserve': True})
        for index in (0, 1):
            with self.subTest(index=index):
                for path, content in zip(self.paths, self.originals):
                    path.write_bytes(content)
                self.paths[index].write_bytes(invalid)
                before = [path.read_bytes() for path in self.paths]
                with self.assertRaises(InvalidToken):
                    trigger_encryption.reencrypt_files(self.paths, self.encrypter)
                self.assertEqual([path.read_bytes() for path in self.paths], before)
                self.assertEqual(list(self.root.glob('*.encrypted_backup')), [])

    def test_mixed_plaintext_and_encrypted_data_keep_private_original_backups(self):
        backups = trigger_encryption.reencrypt_files(self.paths, self.encrypter)
        self.assertEqual([path.read_bytes() for path in backups], self.originals)
        self.assertTrue(all(path.stat().st_mode & 0o777 == 0o600 for path in backups))
        decoded = [json.loads(self.encrypter.fernet.decrypt(path.read_bytes())) for path in self.paths]
        self.assertEqual(decoded, [{'operator': {'plan': 'free'}}, {}])

    def test_missing_original_prevents_rewriting_other_file(self):
        self.paths[1].unlink()
        with self.assertRaises(FileNotFoundError):
            trigger_encryption.reencrypt_files(self.paths, self.encrypter)
        self.assertEqual(self.paths[0].read_bytes(), self.originals[0])
        self.assertEqual(list(self.root.glob('*.encrypted_backup')), [])

    def test_backup_failure_prevents_replacing_either_original(self):
        original = trigger_encryption.NamedTemporaryFile
        calls = 0
        def create_backup(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError('synthetic backup failure')
            return original(**kwargs)
        with patch.object(trigger_encryption, 'NamedTemporaryFile', side_effect=create_backup):
            with self.assertRaises(OSError):
                trigger_encryption.reencrypt_files(self.paths, self.encrypter)
        self.assertEqual([path.read_bytes() for path in self.paths], self.originals)

    def test_failed_replacement_preserves_both_recoverable_backups(self):
        replace = trigger_encryption.os.replace
        calls = 0
        def replace_file(source, destination):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError('synthetic replacement failure')
            return replace(source, destination)
        with patch.object(trigger_encryption.os, 'replace', side_effect=replace_file):
            with self.assertRaises(OSError):
                trigger_encryption.reencrypt_files(self.paths, self.encrypter)
        for path, content in zip(self.paths, self.originals):
            backups = list(self.root.glob(path.name + '.*.encrypted_backup'))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), content)
