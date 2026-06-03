import api from '../../../shared/api/client';

export const getClients      = (params) => api.get('/clients/clients/', { params });
export const getClientDetail = (nif)    => api.get(`/clients/clients/${nif}/`);
export const createClient    = (data)   => api.post('/clients/clients/', data);
