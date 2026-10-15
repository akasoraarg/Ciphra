// Same-origin API; application sessions are verified by the server.
window.API_BASE = window.API_BASE || '';

const Auth = {
    _getStorageItem: key => localStorage.getItem(key),
    _setStorageItem: (key, value) => {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
    },
    _removeStorageItem: key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    },
    clear: () => {
        Auth._removeStorageItem('ciphra_token');
        Auth._removeStorageItem('ciphra_user');
    },
    _request: async (path, body, token) => {
        const done = window.PageUI?.beginAll('[data-auth-action]') || (() => {});
        try {
            const response = await fetch(`${API_BASE}/api/auth/${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) return { success: false, message: data.message || data.detail || data.error || 'No se pudo completar la solicitud.' };
            return data;
        } catch (_) {
            return { success: false, message: 'Error de conexión con el servidor.' };
        } finally { done(); }
    },
    _signIn: async (path, body) => {
        const data = await Auth._request(path, body);
        if (data.success && data.token && data.user) {
            Auth._setStorageItem('ciphra_token', data.token);
            Auth._setStorageItem('ciphra_user', JSON.stringify(data.user));
        }
        return data;
    },
    login: (email, password) => Auth._signIn('login', { email, password }),
    register: (email, password, profile = {}) => Auth._signIn('register', { ...profile, email, password }),
    googleLogin: credential => Auth._signIn('google-login', { credential }),
    logout: async () => {
        const result = await Auth._request('logout', {}, Auth._getStorageItem('ciphra_token'));
        if (!result.success) {
            alert(result.message);
            return false;
        }
        Auth.clear();
        window.location.assign('login.html');
        return true;
    },
    redeem: async code => {
        const data = await Auth._request('redeem', { code }, Auth._getStorageItem('ciphra_token'));
        if (data.success) Auth._setStorageItem('ciphra_user', JSON.stringify(data.user));
        return data;
    },
    check: async () => {
        const token = Auth._getStorageItem('ciphra_token');
        if (!token) return false;
        await window.PageUI?.ready;
        const done = window.PageUI?.beginAll('[data-auth-loading]') || (() => {});
        try {
            const response = await fetch(`${API_BASE}/api/auth/check`, { headers: { Authorization: token } });
            if (response.status === 401) {
                Auth.clear();
                return false;
            }
            if (!response.ok) return false;
            const data = await response.json();
            if (!data.authenticated || !data.user) return false;
            Auth._setStorageItem('ciphra_user', JSON.stringify(data.user));
            return true;
        } catch (_) {
            return false;
        } finally { done(); }
    },
    loginRedirect: () => {
        const target = window.location.pathname + window.location.search;
        window.location.replace(`login.html?redirect=${encodeURIComponent(target)}`);
    },
    safeRedirect: () => {
        const value = new URLSearchParams(window.location.search).get('redirect') || 'commander.html';
        try {
            const url = new URL(value, window.location.href);
            if (url.origin === window.location.origin && /^https?:$/.test(url.protocol) &&
                !['/login.html', '/register.html'].includes(url.pathname)) return url.pathname + url.search;
        } catch (_) { /* Use the default destination. */ }
        return 'commander.html';
    },
    requireAuth: () => Auth.guard(),
    isAuthenticated: () => Boolean(Auth._getStorageItem('ciphra_token') && Auth.getUser()),
    getUser: () => {
        if (!Auth._getStorageItem('ciphra_token')) return null;
        try {
            const user = JSON.parse(Auth._getStorageItem('ciphra_user'));
            return user && typeof user === 'object' && typeof user.email === 'string' ? user : null;
        } catch (_) { return null; }
    },
    guard: async () => {
        if (await Auth.check()) return true;
        Auth.loginRedirect();
        return false;
    }
};

// A logout in another tab must not resurrect a stale sessionStorage token.
window.addEventListener('storage', event => {
    if ((event.key === 'ciphra_token' && !event.newValue) || event.key === null) {
        Auth.clear();
        window.location.replace('login.html');
    }
});
