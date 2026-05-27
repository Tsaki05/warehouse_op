/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginApi, meApi } from '../api/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem('access'));

  useEffect(() => {
    const token = localStorage.getItem('access');
    if (!token) return;
    meApi()
      .then(res => setUser(res.data))
      .catch(() => { localStorage.removeItem('access'); localStorage.removeItem('refresh'); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await loginApi(username, password);
    localStorage.setItem('access',  res.data.access);
    localStorage.setItem('refresh', res.data.refresh);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
