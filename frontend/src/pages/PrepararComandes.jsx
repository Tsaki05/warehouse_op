import { useState, useEffect, useCallback } from 'react';
import { getComandes } from '../api/api';
import { useDebounce } from '../hooks/useDebounce';
import { useFilter } from '../contexts/FilterContext';

const METODE_LABEL = { 1: 'Targeta', 2: 'Transferència', 3: 'Efectiu' };
const METODE_BADGE = { 1: 'blue',    2: 'green',          3: 'orange' };

const FILTRES_ENVIAMENT = [
  { key: '',      label: 'Tots' },
  { key: 'true',  label: '🚚 Enviament' },
  { key: 'false', label: '🏪 Recollida' },
];

const ORDRES = [
  { key: 'data_desc',  label: 'Data ↓ (recent)' },
  { key: 'data_asc',   label: 'Data ↑ (antic)' },
  { key: 'preu_desc',  label: 'Preu ↓' },
  { key: 'preu_asc',   label: 'Preu ↑' },
];

export default function PrepararComandes() {
  const { magFiltrat } = useFilter();

  const [comandes, setComandes]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [expandida, setExpandida] = useState(null);

  const [cercaInput, setCercaInput] = useState('');
  const [enviament, setEnviament]   = useState('');
  const [ordre, setOrdre]           = useState('data_desc');
  const cerca                       = useDebounce(cercaInput, 350);

  const load = useCallback((params) => {
    setLoading(true);
    getComandes({ sense_factura: 'true', ...params })
      .then(res => {
        setComandes(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError('No s\'ha pogut carregar les comandes.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const magIds = magFiltrat.map(m => m.codi_magatzem);
    load({
      cerca:           cerca || undefined,
      enviament:       enviament || undefined,
      ordre,
      magatzem_filter: magIds.length > 0 ? magIds : undefined,
    });
    setExpandida(null);
  }, [load, cerca, enviament, ordre, magFiltrat]);

  if (error) return <div className="state-box state-box--error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📦 Preparar Comandes</h1>
        <p className="page-subtitle">Comandes pendents de facturar — paquets per preparar.</p>
      </div>

      {/* ── Controls ── */}
      <div className="search-controls">
        <div className="search-bar" style={{ flex: 1 }}>
          <input
            className="search-input"
            placeholder="Cercar per codi, NIF o nom de client..."
            value={cercaInput}
            onChange={e => setCercaInput(e.target.value)}
          />
          {cercaInput && (
            <button type="button" className="search-clear"
              onClick={() => setCercaInput('')}>✕</button>
          )}
          {loading && cercaInput && (
            <span style={{ padding: '0 12px', color: '#aab4be', fontSize: '0.85rem' }}>⟳</span>
          )}
        </div>

        <div className="filter-bar" style={{ margin: 0 }}>
          {FILTRES_ENVIAMENT.map(f => (
            <button
              key={f.key}
              className={`filter-btn${enviament === f.key ? ' filter-btn--active' : ''}`}
              onClick={() => { setEnviament(f.key); setExpandida(null); }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          className="sort-select"
          value={ordre}
          onChange={e => { setOrdre(e.target.value); setExpandida(null); }}
        >
          {ORDRES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Resum ── */}
      {!loading && (
        <p className="result-count">
          {total.toLocaleString()} comandes pendents
          {cercaInput && <> · cerca: <em>"{cercaInput}"</em></>}
        </p>
      )}

      {/* ── Llista ── */}
      {loading ? (
        <div className="state-box">Carregant comandes...</div>
      ) : comandes.length === 0 ? (
        <div className="state-box">No s'han trobat comandes amb aquests filtres.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {comandes.map(c => (
            <div key={c.id_comanda} className="comanda-card">
              <div
                className="comanda-header"
                onClick={() => setExpandida(expandida === c.id_comanda ? null : c.id_comanda)}
              >
                <div>
                  <div className="comanda-id">{c.id_comanda}</div>
                  <div className="comanda-client">
                    {c.client_nom}
                    <span className="text-mono" style={{ marginLeft: 8, opacity: 0.5, fontSize: '0.8rem' }}>
                      {c.client}
                    </span>
                    {c.data && <span style={{ marginLeft: 8, color: '#aab4be' }}>· {c.data}</span>}
                  </div>
                </div>
                <div className="comanda-meta">
                  <span className={`badge badge--${METODE_BADGE[c.metode_pagament] || 'gray'}`}>
                    {METODE_LABEL[c.metode_pagament] || '—'}
                  </span>
                  <span className={`badge badge--${c.enviament ? 'blue' : 'gray'}`}>
                    {c.enviament ? '🚚 Enviament' : '🏪 Recollida'}
                  </span>
                  <span className="comanda-amount">{parseFloat(c.import_total).toFixed(2)} €</span>
                  <span style={{ color: '#aab4be', fontSize: '0.85rem' }}>
                    {expandida === c.id_comanda ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {expandida === c.id_comanda && (
                c.paquets?.length > 0
                  ? <div style={{ borderTop: '1px solid #f0f2f5' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Producte</th>
                            <th>Quantitat</th>
                            <th>Preu unit.</th>
                            <th>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.paquets.map((p, i) => (
                            <tr key={i}>
                              <td>
                                <div>{p.producte_nom}</div>
                                <div className="text-mono" style={{ opacity: 0.45, fontSize: '0.78rem' }}>{p.producte}</div>
                              </td>
                              <td>
                                {p.quantitat < 0
                                  ? <span className="badge badge--red">Retorn {Math.abs(p.quantitat)}</span>
                                  : p.quantitat}
                              </td>
                              <td>{parseFloat(p.preu).toFixed(2)} €</td>
                              <td><strong>{(p.quantitat * parseFloat(p.preu)).toFixed(2)} €</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  : <div style={{ padding: '18px 22px', color: '#95a5a6' }}>
                      Aquesta comanda no té paquets.
                    </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
