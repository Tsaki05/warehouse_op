import { useState, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth, LoginPage } from '../features/auth';
import { useFilter } from '../shared/contexts/FilterContext';
import {
  getMagatzems, MagatzemAutocomplete,
  ProductesPage, MagatzemsUbicacionsPage,
} from '../features/inventari';
import { PrepararComandesPage, FacturacioPage } from '../features/comandes';
import { HomePage } from '../features/dashboard';
import { GestioUsuarisPage } from '../features/usuaris';

const ALL_NAV_LINKS = [
  { to: '/',          label: 'Inici',                 icon: '🏠', end: true,  roles: ['admin', 'superior', 'mosso'] },
  { to: '/magatzems', label: 'Magatzems i Ubicacions', icon: '🏢',            roles: ['admin', 'superior'] },
  { to: '/productes', label: 'Productes',              icon: '🏷️',            roles: ['admin', 'superior', 'mosso'] },
  { to: '/comandes',  label: 'Preparar Comandes',     icon: '📦',            roles: ['admin', 'superior', 'mosso'] },
  { to: '/factures',  label: 'Facturació',            icon: '📄',            roles: ['admin', 'superior'] },
  { to: '/usuaris',   label: "Gestió d'Usuaris",      icon: '👥',            roles: ['admin', 'superior'] },
];

const ROL_LABEL = { admin: 'Admin', superior: 'Superior', mosso: 'Mosso' };

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="state-box">Carregant...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function Layout() {
  const { user, logout }              = useAuth();
  const { magFiltrat, setMagFiltrat } = useFilter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = () => setSidebarOpen(false);

  const fetchMagatzems = useCallback(
    q => getMagatzems({ cerca: q || undefined, page_size: 50 })
           .then(r => r.data.results ?? r.data),
    []
  );

  const navLinks = ALL_NAV_LINKS.filter(l => l.roles.includes(user?.rol));

  return (
    <div className="layout">
      {sidebarOpen && <div className="overlay" onClick={close} />}

      <nav className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-brand">📦 WAREHOUSE OP</span>
          <button className="sidebar-close" onClick={close} aria-label="Tancar menú">✕</button>
        </div>
        {user?.rol === 'admin' && (
          <div className="sidebar-filter">
            <div className="sidebar-filter-label">Filtre magatzem</div>
            <MagatzemAutocomplete
              fetchOptions={fetchMagatzems}
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
                    ? `🏢 ${magFiltrat[0].nom ? `${magFiltrat[0].nom} (${magFiltrat[0].codi_magatzem})` : magFiltrat[0].codi_magatzem}`
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
            <div style={{ fontSize: '0.82rem', opacity: 0.55 }}>
              🏢 {user.magatzem_nom}
              {user.magatzem_codi && (
                <span style={{ marginLeft: 5, fontFamily: 'monospace' }}>({user.magatzem_codi})</span>
              )}
            </div>
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
            <Route path="/"          element={<HomePage />} />
            <Route path="/magatzems" element={<MagatzemsUbicacionsPage />} />
            <Route path="/productes" element={<ProductesPage />} />
            <Route path="/comandes"  element={<PrepararComandesPage />} />
            <Route path="/factures"  element={<FacturacioPage />} />
            <Route path="/usuaris"   element={<GestioUsuarisPage />} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export function AppRouter() {
  const { user, loading } = useAuth();
  if (loading) return <div className="state-box" style={{ margin: '20vh auto', maxWidth: 300 }}>Carregant...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/*" element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      } />
    </Routes>
  );
}
