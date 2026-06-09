import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api',
    paramsSerializer: params => {
        const s = new URLSearchParams();
        for (const [key, val] of Object.entries(params)) {
            if (Array.isArray(val)) val.forEach(v => s.append(key, v));
            else if (val !== undefined && val !== null) s.set(key, val);
        }
        return s.toString();
    },
});

// Attach JWT on every request
api.interceptors.request.use(config => {
    const token = localStorage.getItem('access');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
    res => res,
    async err => {
        const original = err.config;
        if (err.response?.status === 401 && !original._retry) {
            original._retry = true;
            const refresh = localStorage.getItem('refresh');
            if (refresh) {
                try {
                    const res = await axios.post(
                        `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/auth/refresh/`,
                        { refresh }
                    );
                    localStorage.setItem('access', res.data.access);
                    original.headers.Authorization = `Bearer ${res.data.access}`;
                    return api(original);
                } catch {
                    localStorage.removeItem('access');
                    localStorage.removeItem('refresh');
                    window.location.href = '/login';
                }
            } else {
                window.location.href = '/login';
            }
        }
        return Promise.reject(err);
    }
);

export default api;
