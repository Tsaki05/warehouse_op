import api from '../../../shared/api/client';

export const getComandes    = (params)       => api.get('/comandes/comandes/', { params });
export const createComanda  = (data)         => api.post('/comandes/comandes/', data);
export const marcarPreparat = (id, data = {}) => api.patch(`/comandes/comandes/${id}/preparar/`, data);
export const getDashboard   = (params)       => api.get('/comandes/comandes/dashboard/', { params });
export const getFactures    = (params)       => api.get('/comandes/factures/', { params });
export const createFactura  = (data)         => api.post('/comandes/factures/', data);
export const getPaquets     = ()             => api.get('/comandes/paquets/');
