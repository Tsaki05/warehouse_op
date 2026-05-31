import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getClients, getClientDetail, getFactures, getComandes, createFactura } from '../api/api';
import { useAuth } from '../contexts/AuthContext';
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
  const [tab, setTab]   = useState('factures');
  const { user }        = useAuth();
  const location        = useLocation();
  const canInvoice      = user?.rol === 'admin' || user?.rol === 'superior';

  // State passat des de PrepararComandes via navigate('/factures', { state: ... })
  const initState = location.state?.novaFactura
    ? { clientNif: location.state.clientNif, clientNom: location.state.clientNom }
    : null;

  // Esborra l'estat de la URL perquè no es reobri en tornar enrere
  useEffect(() => {
    if (location.state?.novaFactura) {
      window.history.replaceState({}, document.title);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      {tab === 'factures'
        ? <FacturesTab canInvoice={canInvoice} initNovaFactura={initState} />
        : <ClientsTab />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   FACTURES TAB
══════════════════════════════════════════════════════════ */
function FacturesTab({ canInvoice, initNovaFactura }) {
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

  // Modal nova factura
  const [modalFactura, setModalFactura]     = useState(!!initNovaFactura);
  const [prefillClient, setPrefillClient]   = useState(
    initNovaFactura ? { nif: initNovaFactura.clientNif, nom: initNovaFactura.clientNom } : null
  );
  const [pendingOrders, setPendingOrders]   = useState([]);
  const [loadingOrders, setLoadingOrders]   = useState(false);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [modalMetode, setModalMetode]       = useState('');
  const [savingFact, setSavingFact]         = useState(false);
  const [factError, setFactError]           = useState('');

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

  // Carrega comandes preparades del client seleccionat
  useEffect(() => {
    if (!prefillClient?.nif) { setPendingOrders([]); setSelectedOrders(new Set()); return; }
    setLoadingOrders(true);
    getComandes({ client: prefillClient.nif, preparat: 'true', sense_factura: 'true', page_size: 100 })
      .then(res => {
        const orders = res.data.results ?? res.data;
        setPendingOrders(orders);
        setSelectedOrders(new Set(orders.map(o => o.id_comanda)));
      })
      .catch(() => setPendingOrders([]))
      .finally(() => setLoadingOrders(false));
  }, [prefillClient?.nif]);

  function openNovaFactura() {
    setPrefillClient(null);
    setPendingOrders([]);
    setSelectedOrders(new Set());
    setModalMetode('');
    setFactError('');
    setModalFactura(true);
  }

  async function handleCreateFactura() {
    if (selectedOrders.size === 0) { setFactError('Selecciona almenys una comanda.'); return; }
    const selectedList = pendingOrders.filter(o => selectedOrders.has(o.id_comanda));
    const needsMetode  = selectedList.some(o => !o.metode_pagament);
    if (needsMetode && !modalMetode) { setFactError('Cal indicar el mètode de pagament.'); return; }
    setSavingFact(true); setFactError('');
    try {
      const payload = { comandes: [...selectedOrders] };
      if (needsMetode) payload.metode_pagament = parseInt(modalMetode);
      await createFactura(payload);
      setModalFactura(false);
      const magIds = magFiltrat.map(m => m.codi_magatzem);
      load({ cerca: cerca || undefined, ordre, tipus: tipus || undefined,
             data_des: dataDes || undefined, data_fins: dataFins || undefined,
             magatzem_filter: magIds.length > 0 ? magIds : undefined });
    } catch (err) {
      const d = err.response?.data;
      setFactError(d?.metode_pagament?.[0] || d?.comandes?.[0] || d?.detail || 'Error en crear la factura.');
    } finally { setSavingFact(false); }
  }

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

        {canInvoice && (
          <button className="btn-primary" onClick={openNovaFactura}>
            + Nova factura
          </button>
        )}
      </div>

      {/* ── Modal nova factura ── */}
      {modalFactura && (
        <ModalFactura
          prefillClient={prefillClient}
          onClientChange={c => { setPrefillClient(c); setFactError(''); setModalMetode(''); }}
          pendingOrders={pendingOrders}
          loadingOrders={loadingOrders}
          selectedOrders={selectedOrders}
          onToggleOrder={id => setSelectedOrders(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
          })}
          onSelectAll={() => setSelectedOrders(new Set(pendingOrders.map(o => o.id_comanda)))}
          onDeselectAll={() => setSelectedOrders(new Set())}
          metode={modalMetode}
          onMetodeChange={setModalMetode}
          saving={savingFact}
          error={factError}
          onSave={handleCreateFactura}
          onClose={() => setModalFactura(false)}
        />
      )}

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

// ── Modal Nova Factura ────────────────────────────────────────────────────────
const METODE_LABEL = { 1: 'Targeta', 2: 'Transferència', 3: 'Efectiu' };

function ModalFactura({
  prefillClient, onClientChange,
  pendingOrders, loadingOrders,
  selectedOrders, onToggleOrder, onSelectAll, onDeselectAll,
  metode, onMetodeChange,
  saving, error, onSave, onClose,
}) {
  const selectedList     = pendingOrders.filter(o => selectedOrders.has(o.id_comanda));
  const importSeleccionat = selectedList.reduce((s, o) => s + parseFloat(o.import_total), 0);
  const needsMetode      = selectedList.some(o => !o.metode_pagament);

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h3 className="modal-title">Nova factura</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <div className="login-field">
            <label className="login-label">Client *</label>
            <ClientAutocomplete value={prefillClient} onChange={onClientChange} />
          </div>

          {prefillClient && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="login-label" style={{ marginBottom: 0 }}>
                  Comandes preparades
                  {!loadingOrders && (
                    <span style={{ marginLeft: 6, color: '#aab4be', fontWeight: 400 }}>
                      ({pendingOrders.length})
                    </span>
                  )}
                </label>
                {pendingOrders.length > 1 && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn-sm btn-sm--edit" style={{ fontSize: '0.75rem' }}
                      onClick={onSelectAll}>Seleccionar tot</button>
                    <button type="button" className="btn-sm" style={{ fontSize: '0.75rem' }}
                      onClick={onDeselectAll}>Cap</button>
                  </div>
                )}
              </div>

              {loadingOrders ? (
                <div style={{ color: '#aab4be', padding: '10px 0' }}>Carregant comandes...</div>
              ) : pendingOrders.length === 0 ? (
                <div className="alert alert--info">
                  <span>ℹ️</span>
                  <span>Aquest client no té comandes preparades pendents de facturar.</span>
                </div>
              ) : (
                <div style={{ border: '1px solid #e8ecf1', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                  <table className="table" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}></th>
                        <th>Codi</th>
                        <th>Data</th>
                        <th>Import</th>
                        <th>Enviament</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOrders.map(o => (
                        <tr key={o.id_comanda}
                          style={{ cursor: 'pointer', background: selectedOrders.has(o.id_comanda) ? '#f0f7ff' : undefined }}
                          onClick={() => onToggleOrder(o.id_comanda)}>
                          <td>
                            <input type="checkbox" readOnly
                              checked={selectedOrders.has(o.id_comanda)}
                              style={{ cursor: 'pointer' }} />
                          </td>
                          <td className="text-mono">{o.id_comanda}</td>
                          <td style={{ color: '#5d6d7e' }}>{o.data}</td>
                          <td><strong>{parseFloat(o.import_total).toFixed(2)} €</strong></td>
                          <td>
                            <span className={`badge badge--${o.enviament ? 'blue' : 'gray'}`}>
                              {o.enviament ? '🚚' : '🏪'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedOrders.size > 0 && (
                <div className="alert alert--info" style={{ marginBottom: 8 }}>
                  <span>💰</span>
                  <span>
                    {selectedOrders.size} {selectedOrders.size === 1 ? 'comanda' : 'comandes'} seleccionada{selectedOrders.size > 1 ? 'es' : ''} ·{' '}
                    <strong>Total: {importSeleccionat.toFixed(2)} €</strong>
                  </span>
                </div>
              )}

              {needsMetode && selectedOrders.size > 0 && (
                <div className="login-field">
                  <label className="login-label">
                    Mètode de pagament <span style={{ color: '#e74c3c' }}>*</span>
                    <span style={{ fontWeight: 400, color: '#aab4be', marginLeft: 6 }}>
                      (alguna comanda no en té assignat)
                    </span>
                  </label>
                  <select className="login-input" value={metode} onChange={e => onMetodeChange(e.target.value)}>
                    <option value="">— Selecciona un mètode —</option>
                    <option value="1">💳 Targeta</option>
                    <option value="2">🏦 Transferència</option>
                    <option value="3">💵 Efectiu</option>
                  </select>
                </div>
              )}

              {!needsMetode && selectedOrders.size > 0 && (() => {
                const metodes = [...new Set(selectedList.map(o => o.metode_pagament).filter(Boolean))];
                if (metodes.length === 1) return (
                  <div style={{ fontSize: '0.85rem', color: '#5d6d7e', marginBottom: 8 }}>
                    Mètode de pagament: <strong>{METODE_LABEL[metodes[0]]}</strong>
                  </div>
                );
                return null;
              })()}
            </>
          )}

          {error && <div className="login-error"><span>⚠️</span> {error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel·lar</button>
            <button type="button" className="btn-primary"
              disabled={saving || selectedOrders.size === 0 || !prefillClient}
              onClick={onSave}>
              {saving ? 'Creant...' : `Crear factura${selectedOrders.size > 0 ? ` (${selectedOrders.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ClientAutocomplete ────────────────────────────────────────────────────────
function ClientAutocomplete({ value, onChange }) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const queryDb = useDebounce(query, 300);
  const ref     = useRef(null);

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getClients({ cerca: queryDb || undefined })
      .then(res => setOptions(res.data.results ?? res.data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [queryDb, open]);

  return (
    <div className="mag-auto" ref={ref}>
      <div className="mag-auto-wrap">
        <input className="mag-auto-input"
          placeholder={value ? `${value.nom} · ${value.nif}` : 'Cercar per NIF o nom...'}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} />
        {value && (
          <button type="button" className="mag-auto-clear"
            onMouseDown={e => { e.stopPropagation(); onChange(null); setQuery(''); setOpen(false); }}>✕</button>
        )}
      </div>
      {open && (
        <div className="mag-auto-dropdown">
          {loading ? <div className="mag-auto-empty">Carregant...</div>
            : options.length === 0 ? <div className="mag-auto-empty">Cap client trobat</div>
            : options.map(c => (
              <div key={c.nif} className="mag-auto-opt"
                onMouseDown={() => { onChange({ nif: c.nif, nom: c.nom }); setQuery(''); setOpen(false); }}>
                <span className="mag-auto-opt-nom">{c.nom}</span>
                <span className="mag-auto-opt-cod text-mono">{c.nif}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
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
