"""Auth boundary tests; no real accounts, credentials or provider calls."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

with patch.dict(os.environ, {
    'AUTH_PROVIDER': 'supabase', 'VAULT_KEY': 'synthetic-test-vault',
    'CIPHRA_BASE_KEY': 'synthetic-test-base', 'GEMINI_API_KEY': '',
}):
    import main


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        for name, filename in [('USERS_FILE', 'users'), ('SESSIONS_FILE', 'sessions'), ('CHATS_FILE', 'chats')]:
            self.enterContext(patch.object(main, name, str(Path(self.temp.name) / filename)))
        self.enterContext(patch.object(main, 'AUTH_PROVIDER', 'supabase'))
        self.enterContext(patch.dict(os.environ, {
            'SUPABASE_URL': 'https://synthetic.supabase.co',
            'SUPABASE_PUBLISHABLE_KEY': 'synthetic-public-key',
            'PUBLIC_BASE_URL': 'https://ciphra.example', 'GOOGLE_CLIENT_ID': '',
        }))
        main.security._auth_buckets.clear()
        main.security._global_buckets.clear()
        self.requests = []
        self.provider_status = 200
        self.provider_result = self.identity()
        real_client = httpx.AsyncClient
        self.enterContext(patch.object(main.auth_api.httpx, 'AsyncClient',
            lambda **kw: real_client(transport=httpx.MockTransport(self.respond), **kw)))
        self.client = self.enterContext(TestClient(main.app))

    def respond(self, request):
        self.requests.append(request)
        return httpx.Response(self.provider_status, json=self.provider_result)

    def identity(self):
        return {'access_token': 'synthetic-provider-token', 'user': {
            'id': 'synthetic-user-id', 'email': 'operator@example.test',
            'email_confirmed_at': '2026-01-01T00:00:00Z',
            'user_metadata': {'username': 'Operator', 'plan': 'aether'},
        }}

    def login(self):
        return self.client.post('/api/auth/login', json={
            'email': 'OPERATOR@example.test', 'password': 'Synthetic-Password-47!'} )

    def test_login_check_chat_and_logout(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['user']['plan'], 'free')
        self.assertNotIn('synthetic-provider-token', response.text)
        self.assertNotIn('password', data['user'])
        upstream = self.requests[0]
        self.assertEqual(upstream.url.path, '/auth/v1/token')
        self.assertEqual(upstream.url.params['grant_type'], 'password')
        self.assertEqual(upstream.headers['apikey'], 'synthetic-public-key')
        self.assertEqual(json.loads(upstream.content)['email'], 'operator@example.test')
        headers = {'Authorization': data['token']}
        self.assertTrue(self.client.get('/api/auth/check', headers=headers).json()['authenticated'])
        self.assertEqual(self.client.post('/api/chats/create', headers=headers).status_code, 200)
        self.assertEqual(len(self.client.get('/api/chats', headers=headers).json()), 1)
        self.assertEqual(self.client.post('/api/auth/logout', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/api/auth/check', headers=headers).status_code, 401)

    def test_confirmation_does_not_create_session_or_profile(self):
        self.provider_result = {'id': 'unconfirmed-user'}
        response = self.client.post('/api/auth/register', json={
            'email': 'operator@example.test', 'password': 'Synthetic-Password-47!',
            'username': 'Operator', 'plan': 'pro'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['requires_confirmation'])
        self.assertNotIn('token', response.json())
        self.assertFalse(Path(main.USERS_FILE).exists())
        self.assertFalse(Path(main.SESSIONS_FILE).exists())
        upstream = self.requests[0]
        self.assertEqual(upstream.url.path, '/auth/v1/signup')
        self.assertEqual(upstream.url.params['redirect_to'], 'https://ciphra.example/login.html')
        self.assertNotIn('plan', json.loads(upstream.content)['data'])

    def test_provider_failures_never_fall_back_to_local_passwords(self):
        for status, expected in [(400, 401), (429, 429), (503, 503)]:
            with self.subTest(status=status):
                self.provider_status = status
                self.assertEqual(self.login().status_code, expected)
                self.assertFalse(Path(main.SESSIONS_FILE).exists())

    def test_missing_config_fails_closed(self):
        with patch.dict(os.environ, {'SUPABASE_PUBLISHABLE_KEY': '', 'SUPABASE_ANON_KEY': ''}):
            self.assertEqual(self.login().status_code, 503)
        self.assertEqual(self.requests, [])

    def test_google_requires_credential_and_configuration(self):
        self.assertEqual(self.client.post('/api/auth/google-login', json={'email': 'victim@example.test'}).status_code, 503)
        with patch.dict(os.environ, {'GOOGLE_CLIENT_ID': 'synthetic-client'}):
            self.assertEqual(self.client.post('/api/auth/google-login', json={'email': 'victim@example.test'}).status_code, 400)
            response = self.client.post('/api/auth/google-login', json={'credential': 'signed-test-credential'})
            self.assertEqual(response.status_code, 200)
        request = self.requests[-1]
        self.assertEqual(request.url.params['grant_type'], 'id_token')
        self.assertEqual(json.loads(request.content), {'provider': 'google', 'id_token': 'signed-test-credential'})

    def test_unconfirmed_identity_is_rejected(self):
        self.provider_result['user']['email_confirmed_at'] = None
        self.assertEqual(self.login().status_code, 401)
        self.assertFalse(Path(main.SESSIONS_FILE).exists())

    def test_existing_profile_keeps_plan_but_binds_provider_identity(self):
        main.save_users({'operator@example.test': {'plan': 'pro', 'password': 'legacy-hash', 'username': 'Original'}})
        first = self.login().json()
        self.assertEqual(first['user']['plan'], 'pro')
        self.assertEqual(first['user']['username'], 'Original')
        self.assertNotIn('password', main.load_users()['operator@example.test'])
        self.provider_result['user']['id'] = 'replacement-user'
        self.assertEqual(self.login().status_code, 409)

    def test_expired_legacy_and_forged_sessions_are_rejected(self):
        data = self.login().json()
        sessions = main.load_users_raw(main.SESSIONS_FILE)
        sessions[data['token']]['created_at'] = '2000-01-01T00:00:00'
        sessions['legacy-token'] = {'email': data['user']['email'], 'created_at': '2099-01-01T00:00:00'}
        main.save_sessions(sessions)
        for token in (data['token'], 'legacy-token', 'dev_token_pro'):
            self.assertEqual(self.client.get('/api/auth/check', headers={'Authorization': token}).status_code, 401)

    def test_private_operations_reject_anonymous_requests(self):
        for path in ['/api/chats/create', '/api/quantum/solve', '/api/mindshift/upload',
                     '/api/mindshift/generate', '/api/user/save-profile']:
            with self.subTest(path=path):
                self.assertEqual(self.client.post(path).status_code, 401)
        main.save_chats({'old': {'owner': 'anonymous'}})
        self.assertEqual(self.client.get('/api/chats/old').status_code, 401)

    def test_local_mode_remains_explicit_and_google_fails_closed(self):
        with patch.object(main, 'AUTH_PROVIDER', 'local'):
            response = self.client.post('/api/auth/register', json={
                'email': 'operator@example.test', 'password': 'Synthetic-Password-47!', 'username': 'Operator'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.login().status_code, 200)
            self.assertEqual(self.client.post('/api/auth/google-login', json={'email': 'operator@example.test'}).status_code, 503)
        self.assertEqual(self.requests, [])

    def test_google_csp_and_static_secrets(self):
        response = self.client.get('/login.html')
        self.assertEqual(response.status_code, 200)
        self.assertIn('https://accounts.google.com/gsi/client', response.headers['content-security-policy'])
        self.assertEqual(self.client.get('/.env').status_code, 404)
        self.assertEqual(self.client.get('/auth_api.py').status_code, 404)


if __name__ == '__main__':
    unittest.main()
