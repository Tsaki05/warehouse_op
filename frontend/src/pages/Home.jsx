import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getComandes, getClients, getMagatzems, getProductes } from '../api/api';
import { useFilter } from '../contexts/FilterContext';

const METODE_LABEL = { 1: 'Targeta', 2: 'Transferència', 3: 'Efectiu' };
const METODE_BADGE = { 1: 'blue', 2: 'green', 3: 'orange' };

export default function Home() {
  const { magFiltrat } = useFilter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const magIds = magFiltrat.map(m => m.codi_magatzem);
    const magFilter = magIds.length > 0 ? { magatzem_filter: magIds } : {};
    setLoading(true);
    Promise.all([
      getComandes({ sense_factura: 'true', ...magFilter }),
      getClients(),
      getMagatzems(magIds.length > 0 ? { magatzem_filter: magIds } : undefined),
      getProductes(magFilter),
    ]).then(([comandes, clients, magatzems, productes]) => {
      const pendents = comandes.data.results ?? [];
      const totalPendents = comandes.data.count ?? 0;
      const enviaments = pendents.filter(c => c.enviament);

      setStats({
        totalPendents,
        totalEnviaments: enviaments.length,
        totalClients: clients.data.count ?? 0,
        totalMagatzems: magatzems.data.count ?? (magatzems.data.results ?? magatzems.data).length,
        totalProductes: productes.data.count ?? 0,
        comandes: pendents.slice(0, 8),
        enviamentsList: enviaments.slice(0, 6),
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [magFiltrat]);

  if (loading) return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>
      <div className="state-box">Carregant estadístiques...</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {magFiltrat.length === 0
            ? 'Resum de l\'activitat del magatzem.'
            : magFiltrat.length === 1
            ? `Resum de l'activitat · ${magFiltrat[0].nom || magFiltrat[0].codi_magatzem}`
            : `Resum de l'activitat · ${magFiltrat.length} magatzems`}
        </p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <StatCard
          label="Comandes pendents"
          value={stats.totalPendents.toLocaleString()}
          sub="sense factura assignada"
          variant="blue"
          to="/comandes"
        />
        <StatCard
          label="Enviaments pendents"
          value={stats.totalEnviaments}
          sub="de la primera pàgina"
          variant="orange"
          to="/comandes"
        />
        <StatCard
          label="Clients"
          value={stats.totalClients.toLocaleString()}
          sub="empreses i individuals"
          variant="green"
          to="/factures"
        />
        <StatCard
          label="Productes"
          value={stats.totalProductes.toLocaleString()}
          sub={`en ${stats.totalMagatzems} magatzem${stats.totalMagatzems !== 1 ? 's' : ''}`}
          variant="purple"
          to="/productes"
        />
      </div>

      {/* Main sections */}
      <div className="dashboard-grid">
        {/* Últimes comandes pendents */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">📦 Comandes per preparar</span>
            <Link to="/comandes" style={{ fontSize: '0.82rem', color: '#3498db', textDecoration: 'none' }}>
              Veure totes →
            </Link>
          </div>
          <div className="section-card-body">
            {stats.comandes.length === 0
              ? <div style={{ padding: '24px', textAlign: 'center', color: '#aab4be' }}>Sense comandes pendents</div>
              : stats.comandes.map(c => (
                <div key={c.id_comanda} className="list-row">
                  <div>
                    <div className="list-row-main text-mono">{c.id_comanda}</div>
                    <div className="list-row-sub">Client: {c.client}</div>
                  </div>
                  <div className="list-row-right">
                    <div style={{ marginBottom: '4px' }}>
                      <span className={`badge badge--${METODE_BADGE[c.metode_pagament] || 'gray'}`}>
                        {METODE_LABEL[c.metode_pagament]}
                      </span>
                    </div>
                    <div className="list-row-amount">{parseFloat(c.import_total).toFixed(2)} €</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Enviaments pendents */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">🚚 Enviaments pendents</span>
            <span className="section-card-count">{stats.totalEnviaments} (pàg. 1)</span>
          </div>
          <div className="section-card-body">
            {stats.enviamentsList.length === 0
              ? <div style={{ padding: '24px', textAlign: 'center', color: '#aab4be' }}>Sense enviaments pendents</div>
              : stats.enviamentsList.map(c => (
                <div key={c.id_comanda} className="list-row">
                  <div>
                    <div className="list-row-main text-mono">{c.id_comanda}</div>
                    <div className="list-row-sub">Client: {c.client}</div>
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
    </div>
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
