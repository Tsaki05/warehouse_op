import api from '../../../shared/api/client';

export const loginApi = (username, password) => api.post('/auth/login/', { username, password });
export const meApi    = () => api.get('/auth/me/');
