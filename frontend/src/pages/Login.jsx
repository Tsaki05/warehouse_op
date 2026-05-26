import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PasswordInput from '../components/PasswordInput';
import './Login.css';

export default function Login() {
  const { login }              = useAuth();
  const navigate               = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Error de connexió. Torna-ho a intentar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-layout">
      {/* Left panel — branding */}
      <div className="login-panel">
        <div className="login-panel-inner">
          <div className="login-logo">📦</div>
          <h1 className="login-brand">Warehouse OP</h1>
          <p className="login-tagline">Gestió intel·ligent del magatzem</p>
          <ul className="login-features">
            <li>📊 Dashboard en temps real</li>
            <li>📥 Ubicació de productes</li>
            <li>🚚 Gestió de comandes</li>
            <li>📄 Facturació automatitzada</li>
          </ul>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="login-form-side">
        <div className="login-card">
          <h2 className="login-title">Accés al sistema</h2>
          <p className="login-subtitle">Introdueix les teves credencials per continuar</p>

          <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
            <div className="login-field">
              <label htmlFor="username" className="login-label">Usuari</label>
              <input
                id="username"
                type="text"
                className="login-input"
                placeholder="nom d'usuari"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="login-field">
              <label htmlFor="password" className="login-label">Contrasenya</label>
              <PasswordInput
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="login-error">
                <span>⚠️</span> {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Entrant...' : 'Entrar'}
            </button>
          </form>

          <p className="login-hint">
            Problemes per accedir? Contacta amb el teu administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
