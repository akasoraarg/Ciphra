const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
    const storage = () => {
        const values = new Map();
        return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
    };
    const requests = [];
    const navigations = [];
    const listeners = {};
    const context = {
        URL, URLSearchParams, localStorage: storage(), sessionStorage: storage(),
        API_BASE: '', alert: () => {},
        window: { location: { pathname: '/commander.html', search: '',
            href: 'https://ciphra.example/commander.html', origin: 'https://ciphra.example',
            assign: u => navigations.push(u), replace: u => navigations.push(u) },
            addEventListener: (name, callback) => { listeners[name] = callback; } },
        fetch: async (...args) => {
            requests.push(args);
            return { ok: context.status < 400, status: context.status, json: async () => context.response };
        },
        status: 200, response: {},
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('auth.js', 'utf8') + '\nglobalThis.Auth = Auth;', context);
    return { ...context, context, requests, navigations, listeners, auth: context.Auth };
}

test('anonymous users cannot bypass the guard or receive a fake Pro profile', async () => {
    const s = setup();
    s.localStorage.setItem('ciphra_user', JSON.stringify({ email: 'stale@example.test', plan: 'pro' }));
    assert.equal(s.auth.getUser(), null);
    assert.equal(s.auth.isAuthenticated(), false);
    assert.equal(await s.auth.guard(), false);
    assert.equal(s.navigations[0], 'login.html?redirect=%2Fcommander.html');
});

test('login persists server plan and check refreshes it after reload', async () => {
    const s = setup();
    s.context.response = { success: true, token: 'opaque-token', user: { email: 'test@example.test', plan: 'free' } };
    assert.equal((await s.auth.login('test@example.test', 'password')).success, true);
    assert.equal(s.auth.getUser().plan, 'free');
    assert.equal(s.sessionStorage.getItem('ciphra_token'), null);
    s.context.response = { authenticated: true, user: { email: 'test@example.test', plan: 'pro' } };
    assert.equal(await s.auth.check(), true);
    assert.equal(s.auth.getUser().plan, 'pro');
    assert.equal(s.requests[1][1].headers.Authorization, 'opaque-token');
});

test('confirmation-required signup does not store undefined tokens', async () => {
    const s = setup();
    s.context.response = { success: true, requires_confirmation: true };
    assert.equal((await s.auth.register('test@example.test', 'password', { username: 'Test' })).requires_confirmation, true);
    assert.equal(s.localStorage.getItem('ciphra_token'), null);
    assert.equal(s.auth.isAuthenticated(), false);
});

test('401 clears all storage, while server outages preserve credentials', async () => {
    const s = setup();
    s.auth._setStorageItem('ciphra_token', 'opaque-token');
    s.context.status = 503;
    assert.equal(await s.auth.check(), false);
    assert.equal(s.localStorage.getItem('ciphra_token'), 'opaque-token');
    s.context.status = 401;
    s.sessionStorage.setItem('ciphra_token', 'old-token');
    assert.equal(await s.auth.check(), false);
    assert.equal(s.localStorage.getItem('ciphra_token'), null);
    assert.equal(s.sessionStorage.getItem('ciphra_token'), null);
});

test('logout revokes the server session before clearing storage', async () => {
    const s = setup();
    s.auth._setStorageItem('ciphra_token', 'opaque-token');
    s.context.response = { success: true };
    assert.equal(await s.auth.logout(), true);
    assert.equal(s.requests[0][0], '/api/auth/logout');
    assert.equal(s.requests[0][1].headers.Authorization, 'opaque-token');
    assert.equal(s.localStorage.getItem('ciphra_token'), null);
    assert.equal(s.navigations[0], 'login.html');
});

test('failed logout is reported and can be retried', async () => {
    const s = setup();
    s.auth._setStorageItem('ciphra_token', 'opaque-token');
    s.context.status = 503;
    s.context.response = { detail: 'Unavailable' };
    assert.equal(await s.auth.logout(), false);
    assert.equal(s.localStorage.getItem('ciphra_token'), 'opaque-token');
    assert.equal(s.navigations.length, 0);
});

test('Google sends the signed credential and surfaces API errors', async () => {
    const s = setup();
    s.context.status = 401;
    s.context.response = { detail: 'Invalid credential' };
    const result = await s.auth.googleLogin('signed-credential');
    assert.deepEqual(JSON.parse(s.requests[0][1].body), { credential: 'signed-credential' });
    assert.equal(result.message, 'Invalid credential');
});

test('login redirects are limited to same-origin HTTP paths', () => {
    const s = setup();
    for (const redirect of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/login.html', '/register.html']) {
        s.window.location.search = '?redirect=' + encodeURIComponent(redirect);
        assert.equal(s.auth.safeRedirect(), 'commander.html');
    }
    s.window.location.search = '?redirect=%2Fquantum.html';
    assert.equal(s.auth.safeRedirect(), '/quantum.html');
});

test('cross-tab logout cannot resurrect an old sessionStorage token', () => {
    const s = setup();
    s.sessionStorage.setItem('ciphra_token', 'old-token');
    assert.equal(s.auth.isAuthenticated(), false);
    s.listeners.storage({ key: 'ciphra_token', newValue: null });
    assert.equal(s.sessionStorage.getItem('ciphra_token'), null);
    assert.equal(s.navigations[0], 'login.html');
});
