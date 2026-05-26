import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FilterProvider, useFilter } from './contexts/FilterContext';
import MagatzemAutocomplete from './components/MagatzemAutocomplete';
import { getMagatzems } from './api/api';
import Home from './pages/Home';
import MagatzemsUbicacions from './pages/MagatzemsUbicacions';
import Productes from './pages/Productes';
import PrepararComandes from './pages/PrepararComandes';
import Facturacio from './pages/Facturacio';
import GestioUsuaris from './pages/GestioUsuaris';
import Login from './pages/Login';
import './App.css';

const ALL_NAV_LINKS = [
  { to: '/',         label: 'Inici',                icon: '🏠', end: true,  roles: ['admin', 'superior', 'mosso'] },
  { to: '/magatzems',label: 'Magatzems i Ubicacions', icon: '🏢',             roles: ['admin', 'superior'] },
  { to: '/productes',label: 'Productes',             icon: '🏷️',             roles: ['admin', 'superior', 'mosso'] },
  { to: '/comandes', label: 'Preparar Comandes',    icon: '📦',             roles: ['admin', 'superior', 'mosso'] },
  { to: '/factures', label: 'Facturació',           icon: '📄',             roles: ['admin', 'superior'] },
  { to: '/usuaris',  label: 'Gestió d\'Usuaris',    icon: '👥',             roles: ['admin', 'superior'] },
];

const ROL_LABEL = { admin: 'Admin', superior: 'Superior', mosso: 'Mosso' };

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="state-box">Carregant...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function Layout() {
  const { user, logout }               = useAuth();
  const { magFiltrat, setMagFiltrat }  = useFilter();
  const [sidebarOpen, setSidebarOpen]  = useState(false);
  const [magatzems, setMagatzems]      = useState([]);
  const close = () => setSidebarOpen(false);

  useEffect(() => {
    if (user?.rol === 'admin') {
      getMagatzems().then(r => setMagatzems(r.data.results ?? r.data)).catch(() => {});
    }
  }, [user?.rol]);

  const navLinks = ALL_NAV_LINKS.filter(l => l.roles.includes(user?.rol));

  return (
    <div className="layout">
      {sidebarOpen && <div className="overlay" onClick={close} />}

      <nav className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-brand">📦 WAREHOUSE OP</span>
          <button className="sidebar-close" onClick={close} aria-label="Tancar menú">✕</button>
        </div>
        {/* Magatzem filter — admin only */}
        {user?.rol === 'admin' && (
          <div className="sidebar-filter">
            <div className="sidebar-filter-label">Filtre magatzem</div>
            <MagatzemAutocomplete
              magatzems={magatzems}
              value={magFiltrat}
              onChange={setMagFiltrat}
              multi
              placeholder="Tots els magatzems"
              dark
            />
            {magFiltrat.length > 0 && (
              <div className="sidebar-filter-active">
                <span>
                  {magFiltrat.length === 1
                    ? `🏢 ${magFiltrat[0].nom || magFiltrat[0].codi_magatzem}`
                    : `🏢 ${magFiltrat.length} magatzems`}
                </span>
                <button onClick={() => setMagFiltrat([])}>✕</button>
              </div>
            )}
          </div>
        )}

        <div className="sidebar-nav">
          {navLinks.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link" onClick={close}>
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer">
          <div style={{ marginBottom: 6 }}>
            <strong>{user?.nom}</strong>
            <span style={{ marginLeft: 6, opacity: 0.6, fontSize: '0.82rem' }}>
              ({ROL_LABEL[user?.rol] ?? user?.rol})
            </span>
          </div>
          {user?.magatzem_nom && (
            <div style={{ fontSize: '0.82rem', opacity: 0.55 }}>🏢 {user.magatzem_nom}</div>
          )}
          <button className="logout-btn" onClick={logout}>Tancar sessió</button>
        </div>
      </nav>

      <div className="main-area">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Menú">☰</button>
          <span className="topbar-brand">📦 WAREHOUSE OP</span>
        </header>
        <main className="page-content">
          <Routes>
            <Route path="/"         element={<Home />} />
            <Route path="/magatzems" element={<MagatzemsUbicacions />} />
            <Route path="/productes" element={<Productes />} />
            <Route path="/comandes" element={<PrepararComandes />} />
            <Route path="/factures" element={<Facturacio />} />
            <Route path="/usuaris"  element={<GestioUsuaris />} />
            <Route path="*"         element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="state-box" style={{ margin: '20vh auto', maxWidth: 300 }}>Carregant...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      } />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FilterProvider>
          <AppRoutes />
        </FilterProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
