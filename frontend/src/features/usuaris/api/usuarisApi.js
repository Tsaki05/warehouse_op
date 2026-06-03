import api from '../../../shared/api/client';

export const getUsuaris      = ()           => api.get('/auth/usuaris/');
export const createUsuari    = (data)       => api.post('/auth/usuaris/', data);
export const updateUsuari    = (id, data)   => api.patch(`/auth/usuaris/${id}/`, data);
export const deleteUsuari    = (id)         => api.delete(`/auth/usuaris/${id}/`);
export const canviarPassword = (id, pwd)    => api.post(`/auth/usuaris/${id}/password/`, { password: pwd });
