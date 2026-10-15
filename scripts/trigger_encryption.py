"""Re-encrypt users and chats only after validating and backing up both originals."""
import json
import os
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile


def reencrypt_files(paths, encrypter):
    originals = [(Path(path), Path(path).read_bytes()) for path in paths]
    encrypted = []
    for path, content in originals:
        try:
            data = json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError):
            # The application's compatibility decryptor returns {} on failure.
            # This utility must instead propagate invalid-key/corruption errors.
            data = json.loads(encrypter.fernet.decrypt(content))
        if not isinstance(data, dict):
            raise ValueError(f'{path.name} must contain a JSON object')
        encrypted.append((path, encrypter.encrypt(data)))

    backups = []
    for path, content in originals:
        with NamedTemporaryFile(dir=path.parent, prefix=path.name + '.', suffix='.encrypted_backup', delete=False) as backup:
            backup.write(content)
            backup.flush()
            os.fsync(backup.fileno())
            backups.append(Path(backup.name))

    # All validation and both private, durable backups precede any replacement.
    for path, content in encrypted:
        with NamedTemporaryFile(dir=path.parent, prefix='.' + path.name + '.', delete=False) as output:
            temporary = Path(output.name)
            try:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            except BaseException:
                temporary.unlink(missing_ok=True)
                raise
        try:
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    return backups


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
    import main

    backups = reencrypt_files([main.USERS_FILE, main.CHATS_FILE], main.ce_module)
    print('Files encrypted successfully. Original backups:')
    for backup in backups:
        print(backup)
