"""Keep desktop encryption credentials in the user's macOS Keychain."""
import json
from pathlib import Path
import secrets
import subprocess
import sys

SERVICE = 'com.ciphra.desktop'
ACCOUNT = 'encryption-keys'


def encryption_environment(environment, data_directory):
    env = environment.copy()
    if env.get('VAULT_KEY') and (env.get('GEMINI_API_KEY') or env.get('CIPHRA_BASE_KEY')):
        return env
    if sys.platform != 'darwin':
        raise RuntimeError('Configure VAULT_KEY and CIPHRA_BASE_KEY before starting the desktop app.')
    result = subprocess.run([
        '/usr/bin/security', 'find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w',
    ], capture_output=True, text=True)
    if result.returncode == 44:  # errSecItemNotFound; other errors must not replace keys.
        if any((Path(data_directory) / name).exists() for name in ('users.json', 'chats.json', 'sessions.json', 'payments_pending.json')):
            raise RuntimeError('Existing desktop data requires its original encryption keys. Restore them before launching.')
        keys = {
            'VAULT_KEY': env.get('VAULT_KEY') or secrets.token_urlsafe(48),
            'CIPHRA_BASE_KEY': env.get('GEMINI_API_KEY') or env.get('CIPHRA_BASE_KEY') or secrets.token_urlsafe(48),
        }
        saved = subprocess.run([
            '/usr/bin/security', 'add-generic-password', '-s', SERVICE, '-a', ACCOUNT,
            '-w', json.dumps(keys),
        ], capture_output=True, text=True)
        if saved.returncode:
            raise RuntimeError('Could not store desktop encryption keys in macOS Keychain.')
    elif result.returncode:
        raise RuntimeError('Could not read desktop encryption keys from macOS Keychain.')
    else:
        try:
            keys = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise RuntimeError('Desktop encryption keys in macOS Keychain are invalid.') from None
        if not isinstance(keys, dict) or any(not isinstance(keys.get(name), str) or not keys[name] for name in ('VAULT_KEY', 'CIPHRA_BASE_KEY')):
            raise RuntimeError('Desktop encryption keys in macOS Keychain are invalid.')
    if not env.get('VAULT_KEY'):
        env['VAULT_KEY'] = keys['VAULT_KEY']
    if not (env.get('GEMINI_API_KEY') or env.get('CIPHRA_BASE_KEY')):
        env['CIPHRA_BASE_KEY'] = keys['CIPHRA_BASE_KEY']
    return env
