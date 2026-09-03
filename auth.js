// Ciphra Auth Helper
window.API_BASE = window.API_BASE || ''; // Rutas relativas para evitar errores de puerto

const Auth = {
    _getStorageItem: (key) => {
        return localStorage.getItem(key) || sessionStorage.getItem(key);
    },
    _setStorageItem: (key, value) => {
        // Guardamos en ambos para máxima compatibilidad entre pestañas y sesiones
        localStorage.setItem(key, value);
        sessionStorage.setItem(key, value);
    },
    _removeStorageItem: (key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    },

    login: async (email, password) => {
        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (data.success) {
                Auth._setStorageItem('ciphra_token', data.token);
                Auth._setStorageItem('ciphra_user', JSON.stringify(data.user));
                return { success: true };
            }
            return { success: false, message: data.message };
        } catch (err) {
            return { success: false, message: 'Error de conexión con el servidor.' };
        }
    },

    register: async (email, password) => {
        try {
            const response = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (data.success) {
                Auth._setStorageItem('ciphra_token', data.token);
                Auth._setStorageItem('ciphra_user', JSON.stringify(data.user));
                return { success: true };
            }
            return { success: false, message: data.message };
        } catch (err) {
            return { success: false, message: 'Error de conexión con el servidor.' };
        }
    },

    googleLogin: async (email, name) => {
        try {
            const response = await fetch(`${API_BASE}/api/auth/google-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name })
            });
            const data = await response.json();
            if (data.success) {
                Auth._setStorageItem('ciphra_token', data.token);
                Auth._setStorageItem('ciphra_user', JSON.stringify(data.user));
                return { success: true };
            }
            return { success: false, message: data.message };
        } catch (err) {
            return { success: false, message: 'Error de conexión con el servidor.' };
        }
    },

    logout: () => {
        Auth._removeStorageItem('ciphra_token');
        Auth._removeStorageItem('ciphra_user');
        console.warn("Cierre de sesión invocado. En modo offline/mock local se mantendrá la sesión en memoria como OPERADOR_DEMO.");
    },

    redeem: async (code) => {
        try {
            const token = Auth._getStorageItem('ciphra_token');
            const response = await fetch(`${API_BASE}/api/auth/redeem`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token
                },
                body: JSON.stringify({ code })
            });
            const data = await response.json();
            if (data.success) {
                // Actualizar usuario local con el nuevo plan
                Auth._setStorageItem('ciphra_user', JSON.stringify(data.user));
                return { success: true, message: data.message };
            }
            return { success: false, message: data.error };
        } catch (err) {
            return { success: false, message: 'Error de conexión.' };
        }
    },

    check: async () => {
        // En modo offline / mock local siempre se considera autenticado
        return true;
    },

    requireAuth: () => {
        return true;
    },

    isAuthenticated: () => {
        return true;
    },

    getUser: () => {
        const user = Auth._getStorageItem('ciphra_user');
        if (user) {
            try {
                const parsed = JSON.parse(user);
                parsed.plan = 'pro';
                return parsed;
            } catch (e) {}
        }
        return OPERADOR_DEMO;
    },

    guard: async () => {
        // En modo offline / mock local no bloquea la navegación ni redirige
        return true;
    }
};
