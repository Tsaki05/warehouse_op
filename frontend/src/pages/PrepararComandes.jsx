import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFilter } from '../contexts/FilterContext';
import { getComandes, getClients, getProductes, createComanda, marcarPreparat } from '../api/api';
import { useDebounce } from '../hooks/useDebounce';

const METODE_LABEL = { 1: 'Targeta', 2: 'Transferència', 3: 'Efectiu' };
const METODE_BADGE = { 1: 'blue',    2: 'green',          3: 'orange' };

const FILTRES_ENVIAMENT = [
  { key: '',      label: 'Tots' },
  { key: 'true',  label: '🚚 Enviament' },
  { key: 'false', label: '🏪 Recollida' },
];

const FILTRES_PREPARAT = [
  { key: '',      label: 'Totes' },
  { key: 'false', label: '⏳ Per preparar' },
  { key: 'true',  label: '✅ Preparades' },
];

const ORDRES = [
  { key: 'data_desc',  label: 'Data ↓ (recent)' },
  { key: 'data_asc',   label: 'Data ↑ (antic)' },
  { key: 'preu_desc',  label: 'Preu ↓' },
  { key: 'preu_asc',   label: 'Preu ↑' },
];

const EMPTY_FORM = {
  clientObj: null, metode_pagament: '', enviament: false, tipus: 'compra',
};
const EMPTY_PAQUET = { producteObj: null, preu: '', quantitat: 1 };

export default function PrepararComandes() {
  const { user }       = useAuth();
  const { magFiltrat } = useFilter();
  const canCreate      = user?.rol === 'admin' || user?.rol === 'superior';

  const [comandes, setComandes]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [expandida, setExpandida] = useState(null);

  const [cercaInput, setCercaInput]   = useState('');
  const [enviament, setEnviament]     = useState('');
  const [preparatFlt, setPreparatFlt] = useState('');
  const [ordre, setOrdre]             = useState('data_desc');
  const cerca                         = useDebounce(cercaInput, 350);

  // modals
  const [modalNova, setModalNova] = useState(false);
  const [modalCsv, setModalCsv]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  // form nova comanda
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [paquets, setPaquets]     = useState([{ ...EMPTY_PAQUET }]);

  const magIds    = magFiltrat.map(m => m.codi_magatzem);
  const magFilter = magIds.length > 0 ? { magatzem_filter: magIds } : {};

  const load = useCallback((params) => {
    setLoading(true);
    getComandes({ sense_factura: 'true', ...params })
      .then(res => {
        setComandes(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError("No s'ha pogut carregar les comandes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load({
      cerca:    cerca || undefined,
      enviament: enviament || undefined,
      preparat:  preparatFlt || undefined,
      ordre,
      ...magFilter,
    });
    setExpandida(null);
  }, [load, cerca, enviament, preparatFlt, ordre, magFiltrat]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openModalNova() {
    setForm({ ...EMPTY_FORM });
    setPaquets([{ ...EMPTY_PAQUET }]);
    setFormError('');
    setModalNova(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.clientObj) { setFormError('Cal seleccionar un client.'); return; }
    if (paquets.some(p => !p.producteObj)) { setFormError('Cal seleccionar producte per a cada línia.'); return; }

    const signe = form.tipus === 'retorn' ? -1 : 1;
    const payload = {
      client:          form.clientObj.nif,
      metode_pagament: form.metode_pagament ? parseInt(form.metode_pagament) : null,
      enviament:       form.tipus === 'retorn' ? false : form.enviament,
      magatzem:        magFiltrat[0]?.codi_magatzem ?? undefined,
      paquets: paquets.map(p => ({
        producte:  p.producteObj.id_producte,
        preu:      parseFloat(p.producteObj.preu),
        quantitat: signe * Math.abs(parseInt(p.quantitat) || 1),
      })),
    };

    setSaving(true); setFormError('');
    try {
      await createComanda(payload);
      load({ cerca: cerca || undefined, enviament: enviament || undefined, preparat: preparatFlt || undefined, ordre, ...magFilter });
      setModalNova(false);
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.paquets?.[0] || d?.id_comanda?.[0] || d?.detail
        || (typeof d === 'object' ? JSON.stringify(d) : d)
        || 'Error en crear la comanda.';
      setFormError(msg);
    } finally { setSaving(false); }
  }

  async function handlePreparat(id) {
    try {
      const res = await marcarPreparat(id);
      setComandes(prev => prev.map(c => c.id_comanda === id ? res.data : c));
    } catch {
      alert("No s'ha pogut marcar la comanda com a preparada.");
    }
  }

  const previewTotal = paquets.reduce((sum, p) => {
    const q  = Math.abs(parseInt(p.quantitat) || 0) * (form.tipus === 'retorn' ? -1 : 1);
    const pr = p.producteObj ? parseFloat(p.producteObj.preu) : 0;
    return sum + q * pr;
  }, 0);

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
            <button type="button" className="search-clear" onClick={() => setCercaInput('')}>✕</button>
          )}
          {loading && cercaInput && (
            <span style={{ padding: '0 12px', color: '#aab4be', fontSize: '0.85rem' }}>⟳</span>
          )}
        </div>

        <div className="filter-bar" style={{ margin: 0 }}>
          {FILTRES_ENVIAMENT.map(f => (
            <button key={f.key}
              className={`filter-btn${enviament === f.key ? ' filter-btn--active' : ''}`}
              onClick={() => { setEnviament(f.key); setExpandida(null); }}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="filter-bar" style={{ margin: 0 }}>
          {FILTRES_PREPARAT.map(f => (
            <button key={f.key}
              className={`filter-btn${preparatFlt === f.key ? ' filter-btn--active' : ''}`}
              onClick={() => { setPreparatFlt(f.key); setExpandida(null); }}>
              {f.label}
            </button>
          ))}
        </div>

        <select className="sort-select" value={ordre}
          onChange={e => { setOrdre(e.target.value); setExpandida(null); }}>
          {ORDRES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

        {canCreate && (
          <>
            <button className="btn-secondary" onClick={() => { setFormError(''); setModalCsv(true); }}>
              📥 Importar CSV
            </button>
            <button className="btn-primary" onClick={openModalNova}>
              + Nova comanda
            </button>
          </>
        )}
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
              <div className="comanda-header"
                onClick={() => setExpandida(expandida === c.id_comanda ? null : c.id_comanda)}>
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
                  {c.metode_pagament != null && (
                    <span className={`badge badge--${METODE_BADGE[c.metode_pagament] || 'gray'}`}>
                      {METODE_LABEL[c.metode_pagament]}
                    </span>
                  )}
                  <span className={`badge badge--${c.enviament ? 'blue' : 'gray'}`}>
                    {c.enviament ? '🚚 Enviament' : '🏪 Recollida'}
                  </span>
                  {c.paquets?.some(p => p.quantitat < 0) && (
                    <span className="badge badge--red">🔄 Retorn</span>
                  )}
                  {c.preparat
                    ? <span className="badge badge--green" title={c.preparat_per_nom ? `Preparat per ${c.preparat_per_nom}` : ''}>✅ Preparada</span>
                    : (
                      <button
                        className="btn-sm btn-sm--edit"
                        style={{ fontSize: '0.78rem' }}
                        onClick={e => { e.stopPropagation(); handlePreparat(c.id_comanda); }}
                      >
                        Preparar
                      </button>
                    )
                  }
                  <span className="comanda-amount">{parseFloat(c.import_total).toFixed(2)} €</span>
                  <span style={{ color: '#aab4be', fontSize: '0.85rem' }}>
                    {expandida === c.id_comanda ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {expandida === c.id_comanda && (
                c.paquets?.length > 0 ? (
                  <div style={{ borderTop: '1px solid #f0f2f5' }}>
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
                ) : (
                  <div style={{ padding: '18px 22px', color: '#95a5a6' }}>
                    Aquesta comanda no té paquets.
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modal nova comanda ── */}
      {modalNova && (
        <Modal title="Nova comanda" onClose={() => setModalNova(false)}>
          <form onSubmit={handleCreate} className="modal-form">

            {/* Tipus: compra o retorn */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[
                { key: 'compra', label: '🛒 Compra', desc: 'Quantitats positives' },
                { key: 'retorn', label: '🔄 Retorn', desc: 'Quantitats negatives' },
              ].map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipus: t.key }))}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, border: '2px solid',
                    borderColor: form.tipus === t.key ? '#3498db' : '#e0e6ed',
                    background: form.tipus === t.key ? '#ebf5fb' : '#fff',
                    cursor: 'pointer', textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{t.label}</div>
                  <div style={{ fontSize: '0.78rem', color: '#7f8c8d' }}>{t.desc}</div>
                </button>
              ))}
            </div>

            <Field label="Client" required>
              <ClientAutocomplete
                value={form.clientObj}
                onChange={c => setForm(f => ({ ...f, clientObj: c }))}
              />
            </Field>

            <Field label="Mètode de pagament">
              <select className="login-input" value={form.metode_pagament}
                onChange={e => setForm(f => ({ ...f, metode_pagament: e.target.value }))}>
                <option value="">— Sense definir (s'assignarà a la factura) —</option>
                <option value="1">💳 Targeta</option>
                <option value="2">🏦 Transferència</option>
                <option value="3">💵 Efectiu</option>
              </select>
            </Field>

            {form.tipus !== 'retorn' && (
              <Field label="">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.enviament}
                    onChange={e => setForm(f => ({ ...f, enviament: e.target.checked }))} />
                  <span>🚚 Enviament a domicili</span>
                </label>
              </Field>
            )}

            {/* Paquets */}
            <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label className="login-label">
                  📦 {form.tipus === 'retorn' ? 'Productes a retornar' : 'Productes'} *
                </label>
                <button type="button" className="btn-sm btn-sm--edit"
                  onClick={() => setPaquets(ps => [...ps, { ...EMPTY_PAQUET }])}>
                  + Afegir línia
                </button>
              </div>

              {paquets.map((p, i) => (
                <div key={i} style={{
                  background: '#f8f9fa', borderRadius: 8, padding: '10px 12px',
                  marginBottom: 8, display: 'grid',
                  gridTemplateColumns: '1fr 80px 80px auto', gap: 8, alignItems: 'end',
                }}>
                  <div>
                    <label className="login-label" style={{ fontSize: '0.78rem' }}>Producte</label>
                    <ProducteAutocomplete
                      value={p.producteObj}
                      onChange={prod => {
                        const n = [...paquets];
                        n[i] = { ...n[i], producteObj: prod };
                        setPaquets(n);
                      }}
                    />
                  </div>
                  <div>
                    <label className="login-label" style={{ fontSize: '0.78rem' }}>Preu unit.</label>
                    <div style={{
                      padding: '8px 10px', background: '#eef0f3', borderRadius: 6,
                      fontSize: '0.9rem', color: '#5d6d7e', fontFamily: 'monospace',
                      minHeight: 36, display: 'flex', alignItems: 'center',
                    }}>
                      {p.producteObj ? `${parseFloat(p.producteObj.preu).toFixed(2)} €` : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="login-label" style={{ fontSize: '0.78rem' }}>Quantitat</label>
                    <input className="login-input" type="number" min="1"
                      value={p.quantitat}
                      onChange={e => { const n = [...paquets]; n[i] = { ...n[i], quantitat: e.target.value }; setPaquets(n); }} />
                  </div>
                  {paquets.length > 1 && (
                    <button type="button" className="btn-sm btn-sm--del" style={{ marginBottom: 1 }}
                      onClick={() => setPaquets(ps => ps.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}

              <div className="alert alert--info" style={{ marginTop: 8 }}>
                <span>💰</span>
                <span>
                  Import total:{' '}
                  <strong style={{ color: previewTotal < 0 ? '#e74c3c' : '#27ae60' }}>
                    {previewTotal.toFixed(2)} €
                  </strong>
                  {form.tipus === 'retorn' && previewTotal !== 0 && (
                    <span style={{ color: '#7f8c8d', fontSize: '0.85rem', marginLeft: 8 }}>(retorn)</span>
                  )}
                </span>
              </div>
            </div>

            {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setModalNova(false)}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Creant...' : `Crear ${form.tipus === 'retorn' ? 'retorn' : 'comanda'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal importar CSV (placeholder) ── */}
      {modalCsv && (
        <Modal title="Importar comandes des de CSV" onClose={() => setModalCsv(false)}>
          <div className="modal-form">
            <div className="alert alert--info">
              <span>📋</span>
              <div>
                <strong>Format pendent de definir</strong>
                <p style={{ marginTop: 4, fontSize: '0.9rem' }}>
                  El format del fitxer CSV s'ha de concretar per cobrir casos
                  com comandes múltiples, retorns i assignació de magatzems.
                  Parla amb l'equip per definir l'estructura abans d'implementar.
                </p>
              </div>
            </div>
            <Field label="Fitxer CSV">
              <input type="file" className="login-input" accept=".csv" disabled
                style={{ cursor: 'not-allowed', opacity: 0.5 }} />
            </Field>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setModalCsv(false)}>Tancar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── ClientAutocomplete ────────────────────────────────────────────────────────
function ClientAutocomplete({ value, onChange, placeholder = 'Cercar per NIF o nom...' }) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const queryDb = useDebounce(query, 300);
  const ref = useRef(null);

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

  const displayText = value ? `${value.nom} · ${value.nif}` : '';

  return (
    <div className="mag-auto" ref={ref}>
      <div className="mag-auto-wrap">
        <input className="mag-auto-input"
          placeholder={displayText || placeholder}
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
                onMouseDown={() => { onChange(c); setQuery(''); setOpen(false); }}>
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

// ── ProducteAutocomplete ──────────────────────────────────────────────────────
function ProducteAutocomplete({ value, onChange, placeholder = 'Cercar producte...' }) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const queryDb = useDebounce(query, 300);
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getProductes({ cerca: queryDb || undefined })
      .then(res => setOptions(res.data.results ?? res.data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [queryDb, open]);

  const displayText = value ? value.nom : '';

  return (
    <div className="mag-auto" ref={ref}>
      <div className="mag-auto-wrap">
        <input className="mag-auto-input"
          placeholder={displayText || placeholder}
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
            : options.length === 0 ? <div className="mag-auto-empty">Cap producte trobat</div>
            : options.map(p => (
              <div key={p.id_producte} className="mag-auto-opt"
                onMouseDown={() => { onChange(p); setQuery(''); setOpen(false); }}>
                <span className="mag-auto-opt-nom">{p.nom}</span>
                <span className="mag-auto-opt-cod text-mono">{p.id_producte}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="login-field">
      <label className="login-label">{label}{required && ' *'}</label>
      {children}
    </div>
  );
}
