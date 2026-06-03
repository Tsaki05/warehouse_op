import api from '../../../shared/api/client';

export const getMagatzems    = (params) => api.get('/inventari/magatzems/', { params });
export const getUbicacions   = (params) => api.get('/inventari/ubicacions/', { params });
export const getTreballadors = ()       => api.get('/inventari/treballadors/');
export const getProductes    = (params) => api.get('/inventari/productes/', { params });
export const getLots         = (params) => api.get('/inventari/lots/', { params });
export const createProducte  = (data)   => api.post('/inventari/productes/', data);
export const createLot       = (data)   => api.post('/inventari/lots/', data);
export const createUbicacio  = (data)   => api.post('/inventari/ubicacions/', data);
export const deleteUbicacio        = (id)   => api.delete(`/inventari/ubicacions/${id}/`);
export const createUbicacionsBulk = (data) => api.post('/inventari/ubicacions/bulk/', data);
export const createMagatzem  = (data)   => api.post('/inventari/magatzems/', data);
