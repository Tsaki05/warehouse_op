import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/context/AuthContext';
import { useFilter } from '../../../shared/contexts/FilterContext';
import { getComandes, getDashboard } from '../../comandes/api/comandesApi';
import { getProductes } from '../../inventari/api/inventariApi';

export default function Home() {
  const { user }       = useAuth();
  const { magFiltrat } = useFilter();
  const canViewStats   = user?.rol === 'admin' || user?.rol === 'superior';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {magFiltrat.length === 0
            ? "Resum de l'activitat del magatzem."
            : magFiltrat.length === 1
            ? `Resum de l'activitat · ${magFiltrat[0].nom || magFiltrat[0].codi_magatzem}`
            : `Resum de l'activitat · ${magFiltrat.length} magatzems`}
        </p>
      </div>

      {canViewStats
        ? <DashboardAdmin magFiltrat={magFiltrat} />
        : <DashboardMosso magFiltrat={magFiltrat} />
      }
    </div>
  );
}

/* ════════════════════════════════════════
   DASHBOARD ADMIN / SUPERIOR
════════════════════════════════════════ */
function DashboardAdmin({ magFiltrat }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(false);

    const magIds    = magFiltrat.map(m => m.codi_magatzem);
    const magFilter = magIds.length > 0 ? { magatzem_filter: magIds } : {};

    Promise.all([
      getDashboard(magIds.length > 0 ? { magatzem_filter: magIds } : {}),
      getComandes({ sense_factura: 'true', ...magFilter }),
      getProductes({ baix_estoc: 'true', ordre: 'estoc_asc', ...magFilter }),
    ])
      .then(([dashboard, comandes, baixEstoc]) => {
        const pendents = comandes.data.results ?? [];
        setData({
          stats:    dashboard.data,
          totalPend: comandes.data.count ?? 0,
          comandes:  pendents.slice(0, 6),
          baixEstoc: baixEstoc.data.results ?? [],
        });
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [magFiltrat]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <div className="state-box state-box--error">Error carregant el dashboard.</div>;

  const { stats, totalPend, comandes, baixEstoc } = data;
  const { resum, facturacio_mes, top_clients, ranking_treballadors } = stats;

  return (
    <>
      {/* ── Stat cards ── */}
      <div className="stat-grid">
        <StatCard label="Comandes pendents" value={totalPend.toLocaleString()}
          sub="sense factura assignada" variant="blue" to="/comandes" />
        <StatCard label="Comandes (30 dies)" value={resum.n_comandes_mes.toLocaleString()}
          sub="comandes registrades" variant="green" to="/comandes" />
        <StatCard label="Facturat (últim any)"
          value={`${resum.facturacio_total_any.toLocaleString('ca', { maximumFractionDigits: 0 })} €`}
          sub={`${resum.n_factures_any} factures`} variant="purple" to="/factures" />
        <StatCard label="Estoc crític" value={baixEstoc.length}
          sub="productes < 25 unitats" variant="orange" to="/productes?baix_estoc=true" />
      </div>

      {/* ── Gràfica + Rànking ── */}
      <div className="dashboard-grid">
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">🧾 Facturació (últims 30 dies)</span>
            <span className="section-card-count">
              {resum.facturacio_total_mes.toLocaleString('ca', { maximumFractionDigits: 0 })} €
            </span>
          </div>
          <div style={{ padding: '8px 20px 16px' }}>
            <MiniBarChart data={facturacio_mes} valueKey="import" color="#9b59b6" />
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">🏅 Rànking treballadors</span>
            <Link to="/comandes" style={{ fontSize: '0.82rem', color: '#3498db', textDecoration: 'none' }}>
              Veure comandes →
            </Link>
          </div>
          <div className="section-card-body">
            {ranking_treballadors.length === 0
              ? <EmptyBox>Sense comandes preparades</EmptyBox>
              : ranking_treballadors.map((t, i) => (
                <div key={t.id} className="list-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MedalBadge pos={i} />
                    <div>
                      <div className="list-row-main">{t.nom}</div>
                      <div className="list-row-sub">{t.n_comandes} comandes preparades</div>
                    </div>
                  </div>
                  <div className="list-row-right">
                    <div className="list-row-amount">
                      {t.import_total.toLocaleString('ca', { maximumFractionDigits: 2 })} €
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* ── Top clients + Comandes pendents ── */}
      <div className="dashboard-grid">
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">🏆 Top clients (30 dies)</span>
            <span className="section-card-count">
              {top_clients.reduce((s, c) => s + c.import_total, 0)
                .toLocaleString('ca', { maximumFractionDigits: 0 })} €
            </span>
          </div>
          <div className="section-card-body">
            {top_clients.length === 0
              ? <EmptyBox>Sense dades</EmptyBox>
              : top_clients.map((c, i) => (
                <div key={c.nif} className="list-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MedalBadge pos={i} />
                    <div>
                      <div className="list-row-main">{c.nom}</div>
                      <div className="list-row-sub text-mono">{c.nif} · {c.n_comandes} comandes</div>
                    </div>
                  </div>
                  <div className="list-row-right">
                    <div className="list-row-amount">
                      {c.import_total.toLocaleString('ca', { maximumFractionDigits: 2 })} €
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">📦 Comandes per preparar</span>
            <Link to="/comandes" style={{ fontSize: '0.82rem', color: '#3498db', textDecoration: 'none' }}>
              Veure totes →
            </Link>
          </div>
          <div className="section-card-body">
            {comandes.length === 0
              ? <EmptyBox>Sense comandes pendents</EmptyBox>
              : comandes.map(c => (
                <div key={c.id_comanda} className="list-row">
                  <div>
                    <div className="list-row-main text-mono">{c.id_comanda}</div>
                    <div className="list-row-sub">{c.client_nom || c.client}</div>
                  </div>
                  <div className="list-row-right">
                    {c.enviament && (
                      <span className="badge badge--blue" style={{ fontSize: '0.72rem' }}>🚚</span>
                    )}
                    <div className="list-row-amount">{parseFloat(c.import_total).toFixed(2)} €</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════
   DASHBOARD MOSSO
════════════════════════════════════════ */
function DashboardMosso({ magFiltrat }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(false);

    const magIds    = magFiltrat.map(m => m.codi_magatzem);
    const magFilter = magIds.length > 0 ? { magatzem_filter: magIds } : {};

    Promise.all([
      getComandes({ sense_factura: 'true', ...magFilter }),
      getProductes({ baix_estoc: 'true', ...magFilter }),
    ])
      .then(([comandes, baixEstoc]) => {
        const pendents = comandes.data.results ?? [];
        setData({
          totalPend:  comandes.data.count ?? 0,
          comandes:   pendents.slice(0, 8),
          enviaments: pendents.filter(c => c.enviament).slice(0, 6),
          baixEstoc:  baixEstoc.data.results ?? [],
        });
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [magFiltrat]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return null;

  return (
    <>
      <div className="stat-grid">
        <StatCard label="Comandes pendents" value={data.totalPend.toLocaleString()}
          sub="sense factura assignada" variant="blue" to="/comandes" />
        <StatCard label="Enviaments pendents" value={data.enviaments.length}
          sub="de la primera pàgina" variant="orange" to="/comandes" />
        <StatCard label="Estoc crític" value={data.baixEstoc.length}
          sub="productes < 25 unitats" variant="red" to="/productes?baix_estoc=true" />
      </div>

      <div className="dashboard-grid">
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">📦 Comandes per preparar</span>
            <Link to="/comandes" style={{ fontSize: '0.82rem', color: '#3498db', textDecoration: 'none' }}>
              Veure totes →
            </Link>
          </div>
          <div className="section-card-body">
            {data.comandes.length === 0
              ? <EmptyBox>Sense comandes pendents</EmptyBox>
              : data.comandes.map(c => (
                <div key={c.id_comanda} className="list-row">
                  <div>
                    <div className="list-row-main text-mono">{c.id_comanda}</div>
                    <div className="list-row-sub">{c.client_nom || c.client}</div>
                  </div>
                  <div className="list-row-right">
                    {c.enviament && <span className="badge badge--blue" style={{ fontSize: '0.72rem' }}>🚚</span>}
                    <div className="list-row-amount">{parseFloat(c.import_total).toFixed(2)} €</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">🚚 Enviaments pendents</span>
            <span className="section-card-count">{data.enviaments.length}</span>
          </div>
          <div className="section-card-body">
            {data.enviaments.length === 0
              ? <EmptyBox>Sense enviaments pendents</EmptyBox>
              : data.enviaments.map(c => (
                <div key={c.id_comanda} className="list-row">
                  <div>
                    <div className="list-row-main text-mono">{c.id_comanda}</div>
                    <div className="list-row-sub">{c.client_nom || c.client}</div>
                  </div>
                  <div className="list-row-right">
                    <div className="list-row-amount">{parseFloat(c.import_total).toFixed(2)} €</div>
                    <div style={{ fontSize: '0.78rem', color: '#aab4be' }}>{c.data}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════
   LOADING SCREEN
════════════════════════════════════════ */
function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: 320, gap: 16, color: '#aab4be',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid #e8ecf0',
        borderTopColor: '#3498db',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ fontSize: '0.9rem' }}>Carregant dades...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ════════════════════════════════════════
   COMPONENTS REUTILITZABLES
════════════════════════════════════════ */
function EmptyBox({ children }) {
  return <div style={{ padding: '24px', textAlign: 'center', color: '#aab4be' }}>{children}</div>;
}

function MiniBarChart({ data, valueKey, color = '#3498db' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const HEIGHT = 80;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: HEIGHT }}>
        {data.map((d, i) => {
          const h = Math.max((d[valueKey] / max) * HEIGHT, d[valueKey] > 0 ? 3 : 0);
          return (
            <div key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
              title={`${d.dia}: ${d[valueKey].toLocaleString('ca', { maximumFractionDigits: 0 })} €`}>
              <div style={{
                background: d[valueKey] > 0 ? color : '#f0f2f5',
                borderRadius: '2px 2px 0 0',
                height: h,
                transition: 'height 0.2s',
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {[0, 10, 20, 29].map(i => (
          <span key={i} style={{ fontSize: '0.68rem', color: '#aab4be' }}>
            {data[i]?.dia?.slice(5) ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function MedalBadge({ pos }) {
  const colors = ['#f1c40f', '#bdc3c7', '#cd7f32', '#ecf0f1', '#ecf0f1'];
  return (
    <span style={{
      width: 24, height: 24, borderRadius: '50%',
      background: colors[pos] ?? '#ecf0f1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.72rem', fontWeight: 700, color: '#2c3e50', flexShrink: 0,
    }}>{pos + 1}</span>
  );
}

function StatCard({ label, value, sub, variant, to }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div className={`stat-card stat-card--${variant}`}>
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-value">{value}</div>
        <div className="stat-card-sub">{sub}</div>
      </div>
    </Link>
  );
}
