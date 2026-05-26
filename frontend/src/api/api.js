import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
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
                    const res = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/auth/refresh/`, { refresh });
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

// Auth
export const loginApi = (username, password) => api.post('/auth/login/', { username, password });
export const meApi    = () => api.get('/auth/me/');

// Gestió d'usuaris
export const getUsuaris          = ()           => api.get('/auth/usuaris/');
export const createUsuari        = (data)       => api.post('/auth/usuaris/', data);
export const updateUsuari        = (id, data)   => api.patch(`/auth/usuaris/${id}/`, data);
export const deleteUsuari        = (id)         => api.delete(`/auth/usuaris/${id}/`);
export const canviarPassword     = (id, pwd)    => api.post(`/auth/usuaris/${id}/password/`, { password: pwd });

// Inventari
export const getMagatzems    = (params) => api.get('/inventari/magatzems/', { params });
export const getUbicacions   = (params) => api.get('/inventari/ubicacions/', { params });
export const getTreballadors = ()       => api.get('/inventari/treballadors/');
export const getProductes    = (params) => api.get('/inventari/productes/', { params });
export const getLots         = (params) => api.get('/inventari/lots/', { params });
export const createProducte  = (data)   => api.post('/inventari/productes/', data);
export const createLot       = (data)   => api.post('/inventari/lots/', data);
export const createUbicacio  = (data)   => api.post('/inventari/ubicacions/', data);
export const deleteUbicacio  = (id)     => api.delete(`/inventari/ubicacions/${id}/`);

// Clients
export const getClients      = (params) => api.get('/clients/clients/', { params });
export const getClientDetail = (nif)    => api.get(`/clients/clients/${nif}/`);

// Comandes
export const getComandes     = (params) => api.get('/comandes/comandes/', { params });
export const getFactures     = (params) => api.get('/comandes/factures/', { params });
export const getPaquets      = () => api.get('/comandes/paquets/');

export default api;
