import { useState, useEffect, useCallback } from 'react';
import { getClients, getClientDetail, getFactures, getComandes } from '../api/api';
import { useDebounce } from '../hooks/useDebounce';
import { useFilter } from '../contexts/FilterContext';

const TIPUS_CLIENTS = [
  { key: '',           label: 'Tots' },
  { key: 'empresa',    label: '🏢 Empreses' },
  { key: 'individual', label: '👤 Individuals' },
];

const ORDRES_FACTURA = [
  { key: 'data_desc',    label: 'Data ↓ (recent)' },
  { key: 'data_asc',     label: 'Data ↑ (antic)' },
  { key: 'import_desc',  label: 'Import ↓' },
  { key: 'import_asc',   label: 'Import ↑' },
  { key: 'comandes_desc',label: 'Comandes ↓' },
  { key: 'comandes_asc', label: 'Comandes ↑' },
];

const TIPUS_FACTURA = [
  { key: '',           label: 'Totes' },
  { key: 'empresa',    label: '🏢 Multi-comanda' },
  { key: 'individual', label: '👤 1 comanda' },
];

export default function Facturacio() {
  const [tab, setTab] = useState('factures');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📄 Facturació</h1>
        <p className="page-subtitle">Gestió de factures i clients.</p>
      </div>
      <div className="tabs">
        <button className={`tab${tab === 'factures' ? ' tab--active' : ''}`} onClick={() => setTab('factures')}>
          Factures
        </button>
        <button className={`tab${tab === 'clients' ? ' tab--active' : ''}`} onClick={() => setTab('clients')}>
          Clients
        </button>
      </div>
      {tab === 'factures' ? <FacturesTab /> : <ClientsTab />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   FACTURES TAB
══════════════════════════════════════════════════════════ */
function FacturesTab() {
  const { magFiltrat } = useFilter();

  const [factures, setFactures]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [expandida, setExpandida]   = useState(null);

  const [cercaInput, setCercaInput] = useState('');
  const [ordre, setOrdre]           = useState('data_desc');
  const [tipus, setTipus]           = useState('');
  const [dataDes, setDataDes]       = useState('');
  const [dataFins, setDataFins]     = useState('');
  const cerca                       = useDebounce(cercaInput, 350);

  const load = useCallback((params) => {
    setLoading(true);
    getFactures(params)
      .then(res => {
        setFactures(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError('No s\'ha pogut carregar les factures.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const magIds = magFiltrat.map(m => m.codi_magatzem);
    load({
      cerca:           cerca || undefined,
      ordre,
      tipus:           tipus || undefined,
      data_des:        dataDes  || undefined,
      data_fins:       dataFins || undefined,
      magatzem_filter: magIds.length > 0 ? magIds : undefined,
    });
    setExpandida(null);
  }, [load, cerca, ordre, tipus, dataDes, dataFins, magFiltrat]);

  if (error) return <div className="state-box state-box--error">{error}</div>;

  return (
    <>
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
          {TIPUS_FACTURA.map(f => (
            <button key={f.key}
              className={`filter-btn${tipus === f.key ? ' filter-btn--active' : ''}`}
              onClick={() => { setTipus(f.key); setExpandida(null); }}>
              {f.label}
            </button>
          ))}
        </div>

        <select className="sort-select" value={ordre}
          onChange={e => { setOrdre(e.target.value); setExpandida(null); }}>
          {ORDRES_FACTURA.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      <div className="search-controls" style={{ marginTop: 0, marginBottom: 14 }}>
        <label className="login-label" style={{ whiteSpace: 'nowrap', alignSelf: 'center' }}>Data:</label>
        <input type="date" className="sort-select" value={dataDes}
          onChange={e => setDataDes(e.target.value)} title="Des de" />
        <span style={{ alignSelf: 'center', color: '#aab4be' }}>—</span>
        <input type="date" className="sort-select" value={dataFins}
          onChange={e => setDataFins(e.target.value)} title="Fins a" />
        {(dataDes || dataFins) && (
          <button className="search-clear" style={{ position: 'static' }}
            onClick={() => { setDataDes(''); setDataFins(''); }}>✕ Netejar dates</button>
        )}
      </div>

      {!loading && (
        <p className="result-count">
          {total.toLocaleString()} factures
          {cerca && <> · cerca: <em>"{cerca}"</em></>}
        </p>
      )}

      {loading ? (
        <div className="state-box">Carregant factures...</div>
      ) : factures.length === 0 ? (
        <div className="state-box">No s'han trobat factures amb aquests filtres.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {factures.map(f => (
            <div key={f.id_factura} className="comanda-card">
              <div className="comanda-header"
                onClick={() => setExpandida(expandida === f.id_factura ? null : f.id_factura)}>
                <div>
                  <div className="comanda-id">{f.id_factura}</div>
                  <div className="comanda-client">
                    {f.client_nom}
                    <span className="text-mono" style={{ marginLeft: 8, opacity: 0.5, fontSize: '0.8rem' }}>
                      {f.client}
                    </span>
                    <span style={{ marginLeft: 8, color: '#aab4be' }}>· {f.data}</span>
                  </div>
                </div>
                <div className="comanda-meta">
                  <span className="badge badge--gray">
                    {f.n_comandes} {f.n_comandes === 1 ? 'comanda' : 'comandes'}
                  </span>
                  <span className="comanda-amount">{parseFloat(f.import_total).toFixed(2)} €</span>
                  <span style={{ color: '#aab4be', fontSize: '0.85rem' }}>
                    {expandida === f.id_factura ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {expandida === f.id_factura && (
                <FacturaComandes facturaId={f.id_factura} magFiltrat={magFiltrat} />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FacturaComandes({ facturaId, magFiltrat }) {
  const [comandes, setComandes] = useState(null);

  useEffect(() => {
    const magIds = magFiltrat.map(m => m.codi_magatzem);
    getComandes({
      factura:         facturaId,
      page_size:       100,
      magatzem_filter: magIds.length > 0 ? magIds : undefined,
    })
      .then(res => setComandes(res.data.results ?? res.data))
      .catch(() => setComandes([]));
  }, [facturaId, magFiltrat]);

  if (!comandes) return <div style={{ padding: '16px 22px', color: '#aab4be' }}>Carregant comandes...</div>;
  if (!comandes.length) return <div style={{ padding: '16px 22px', color: '#aab4be' }}>Sense comandes associades.</div>;

  return (
    <div style={{ borderTop: '1px solid #f0f2f5' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Codi comanda</th>
            <th>Data</th>
            <th>Enviament</th>
            <th>Import</th>
          </tr>
        </thead>
        <tbody>
          {comandes.map(c => (
            <tr key={c.id_comanda}>
              <td className="text-mono">{c.id_comanda}</td>
              <td>{c.data}</td>
              <td>
                <span className={`badge badge--${c.enviament ? 'blue' : 'gray'}`}>
                  {c.enviament ? '🚚 Enviament' : '🏪 Recollida'}
                </span>
              </td>
              <td><strong>{parseFloat(c.import_total).toFixed(2)} €</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CLIENTS TAB
══════════════════════════════════════════════════════════ */
function ClientsTab() {
  const { magFiltrat }              = useFilter();
  const [clients, setClients]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [expandit, setExpandit]     = useState(null);
  const [detalls, setDetalls]       = useState({});   // { nif: client_detail | 'loading' }
  const [cercaInput, setCercaInput] = useState('');
  const [tipus, setTipus]           = useState('');
  const cerca                       = useDebounce(cercaInput, 350);

  const load = useCallback((params) => {
    setLoading(true);
    getClients(params)
      .then(res => {
        setClients(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError('No s\'ha pogut carregar els clients.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const magIds = magFiltrat.map(m => m.codi_magatzem);
    load({
      cerca:           cerca || undefined,
      tipus:           tipus || undefined,
      magatzem_filter: magIds.length > 0 ? magIds : undefined,
    });
    setExpandit(null);
    setDetalls({});
  }, [load, cerca, tipus, magFiltrat]);

  function handleExpand(nif) {
    if (expandit === nif) { setExpandit(null); return; }
    setExpandit(nif);
    if (!detalls[nif]) {
      setDetalls(d => ({ ...d, [nif]: 'loading' }));
      getClientDetail(nif)
        .then(res => setDetalls(d => ({ ...d, [nif]: res.data })))
        .catch(() => setDetalls(d => ({ ...d, [nif]: null })));
    }
  }

  if (error) return <div className="state-box state-box--error">{error}</div>;

  return (
    <>
      <div className="search-controls">
        <div className="search-bar" style={{ flex: 1 }}>
          <input
            className="search-input"
            placeholder="Cercar per NIF, nom o correu..."
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
          {TIPUS_CLIENTS.map(t => (
            <button key={t.key}
              className={`filter-btn${tipus === t.key ? ' filter-btn--active' : ''}`}
              onClick={() => setTipus(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <p className="result-count">
          Mostrant {clients.length} de {total.toLocaleString()} clients
          {cerca && <> · cerca: <em>"{cerca}"</em></>}
        </p>
      )}

      {loading ? (
        <div className="state-box">Carregant clients...</div>
      ) : clients.length === 0 ? (
        <div className="state-box">Cap client trobat.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {clients.map(c => {
            const detall  = detalls[c.nif];
            const mags    = (detall && detall !== 'loading') ? detall.client_magatzems : c.client_magatzems;
            return (
              <div key={c.nif} className="comanda-card">
                <div className="comanda-header"
                  onClick={() => handleExpand(c.nif)}
                  style={{ cursor: 'pointer' }}>
                  <div>
                    <div className="comanda-id text-mono">{c.nif}</div>
                    <div className="comanda-client">
                      {c.nom}
                      {c.empresa && (
                        <span style={{ marginLeft: 8, color: '#5d6d7e', fontSize: '0.85rem' }}>
                          · {c.empresa.adressa}
                        </span>
                      )}
                      {c.individual && (
                        <span style={{ marginLeft: 8, color: '#5d6d7e', fontSize: '0.85rem' }}>
                          · {c.individual.telefon}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#aab4be', marginTop: 2 }}>
                      {c.correu_electronic}
                    </div>
                  </div>
                  <div className="comanda-meta">
                    <span className={`badge badge--${c.tipus === 'empresa' ? 'blue' : 'green'}`}>
                      {c.tipus === 'empresa' ? '🏢 Empresa' : '👤 Individual'}
                    </span>
                    <span className="badge badge--gray">
                      {c.client_magatzems.length} {c.client_magatzems.length === 1 ? 'magatzem' : 'magatzems'}
                    </span>
                    <span style={{ color: '#aab4be', fontSize: '0.85rem' }}>
                      {expandit === c.nif ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {expandit === c.nif && (
                  detall === 'loading'
                    ? <div style={{ padding: '16px 22px', color: '#aab4be', borderTop: '1px solid #f0f2f5' }}>Carregant estadístiques...</div>
                    : <ClientMagatzems magatzems={mags} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ClientMagatzems({ magatzems }) {
  if (!magatzems.length) {
    return (
      <div style={{ padding: '16px 22px', color: '#aab4be', borderTop: '1px solid #f0f2f5' }}>
        Sense magatzems associats.
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid #f0f2f5' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Magatzem</th>
            <th>Client des de</th>
            <th>Comandes</th>
            <th>Total gastat</th>
          </tr>
        </thead>
        <tbody>
          {magatzems.map(m => (
            <tr key={m.codi_magatzem}>
              <td>
                <span className="text-mono" style={{ fontWeight: 700 }}>{m.codi_magatzem}</span>
                {m.nom_magatzem && (
                  <span style={{ marginLeft: 8, color: '#5d6d7e', fontSize: '0.88rem' }}>
                    {m.nom_magatzem}
                  </span>
                )}
              </td>
              <td style={{ color: '#5d6d7e' }}>{m.data_alta}</td>
              <td>
                <span className="badge badge--gray">{m.n_comandes}</span>
              </td>
              <td><strong>{parseFloat(m.import_total).toFixed(2)} €</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
