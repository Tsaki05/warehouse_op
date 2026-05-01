import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000/api', // Ajusta-ho a la teva URL
});

export const getMagatzems = () => api.get('/magatzems/');
export const getTreballadors = () => api.get('/treballadors/');

export default api;