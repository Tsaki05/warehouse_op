import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFilter } from '../contexts/FilterContext';
import { getProductes, getUbicacions, createProducte, createLot } from '../api/api';
import { useDebounce } from '../hooks/useDebounce';

const CATEGORIES = ['petit', 'mitja', 'gran', 'gegant'];
const CAT_BADGE  = { petit: 'blue', mitja: 'green', gran: 'orange', gegant: 'purple' };
const CAT_LABEL  = { petit: 'Petit', mitja: 'Mitjà', gran: 'Gran', gegant: 'Gegant' };
const ORDRES     = [
  { key: 'nom',        label: 'Nom A→Z' },
  { key: 'estoc_desc', label: 'Estoc ↓' },
  { key: 'estoc_asc',  label: 'Estoc ↑' },
  { key: 'preu_desc',  label: 'Preu ↓' },
  { key: 'preu_asc',   label: 'Preu ↑' },
];
const EMPTY_PROD = {
  id_producte: '', nom: '', descripcio: '', codi_proveidor: '',
  estoc_total: 0, preu: '', categoria: 'petit',
};

export default function Productes() {
  const { user }       = useAuth();
  const { magFiltrat } = useFilter();
  const canEdit        = user?.rol === 'admin' || user?.rol === 'superior';

  const [productes, setProductes]   = useState([]);
  const [baixEstoc, setBaixEstoc]   = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [expandit, setExpandit]     = useState(null);

  const [cerca, setCerca]           = useState('');
  const [categoria, setCategoria]   = useState('');
  const [ordre, setOrdre]           = useState('nom');
  const cercaDb                     = useDebounce(cerca, 350);

  // modals
  const [modalProd, setModalProd]         = useState(false);
  const [modalLot, setModalLot]           = useState(null);   // producte id (per row)
  const [modalLotGlobal, setModalLotGlobal] = useState(false); // standalone Nou lot
  const [saving, setSaving]               = useState(false);
  const [formError, setFormError]         = useState('');

  // form producte
  const [formProd, setFormProd]     = useState(EMPTY_PROD);
  const [formLots, setFormLots]     = useState([{ ubicacio: '', quantitat: 1 }]);

  // form lot (nou stock per-row)
  const [formLot, setFormLot]       = useState({ ubicacio: '', quantitat: 1 });

  // form lot global (standalone)
  const [formLotGlobal, setFormLotGlobal] = useState({ producte: '', ubicacio: '', quantitat: 1 });
  const [cercaProdGlobal, setCercaProdGlobal] = useState('');
  const cercaProdGlobalDb                    = useDebounce(cercaProdGlobal, 350);
  const [prodOptions, setProdOptions]        = useState([]);

  // ubicacions (shared across all modals)
  const [cercaUbic, setCercaUbic]   = useState('');
  const cercaUbicDb                 = useDebounce(cercaUbic, 400);
  const [ubicacions, setUbicacions] = useState([]);

  const magIds   = magFiltrat.map(m => m.codi_magatzem);
  const magFilter = magIds.length > 0 ? { magatzem_filter: magIds } : {};

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadProductes = useCallback(() => {
    setLoading(true);
    getProductes({
      cerca: cercaDb || undefined,
      categoria: categoria || undefined,
      ordre,
      ...magFilter,
    })
      .then(res => {
        setProductes(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError('No s\'ha pogut carregar els productes.'))
      .finally(() => setLoading(false));
  }, [cercaDb, categoria, ordre, magFiltrat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProductes(); }, [loadProductes]);

  useEffect(() => {
    getProductes({ baix_estoc: 'true', ordre: 'estoc_asc', ...magFilter })
      .then(res => setBaixEstoc(res.data.results ?? res.data))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magFiltrat]);

  // Load ubicacions when any modal that needs them is open
  useEffect(() => {
    if (!modalProd && modalLot === null && !modalLotGlobal) return;
    getUbicacions({ cerca: cercaUbicDb || undefined, ...magFilter })
      .then(res => setUbicacions(res.data.results ?? res.data))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cercaUbicDb, modalProd, modalLot, modalLotGlobal, magFiltrat]);

  // Load products for the global lot modal product picker
  useEffect(() => {
    if (!modalLotGlobal) return;
    getProductes({ cerca: cercaProdGlobalDb || undefined, ...magFilter })
      .then(res => setProdOptions(res.data.results ?? res.data))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalLotGlobal, cercaProdGlobalDb, magFiltrat]);

  // ── Create product (with ≥1 lots) ─────────────────────────────────────────
  async function handleCreateProducte(e) {
    e.preventDefault();
    const emptyLots = formLots.filter(l => !l.ubicacio);
    if (emptyLots.length) { setFormError('Cal seleccionar ubicació per a cada lot.'); return; }
    setSaving(true); setFormError('');
    try {
      await createProducte({ ...formProd, lots: formLots });
      loadProductes();
      getProductes({ baix_estoc: 'true', ordre: 'estoc_asc', ...magFilter })
        .then(r => setBaixEstoc(r.data.results ?? r.data));
      setModalProd(false);
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.lots?.[0] || d?.detail || JSON.stringify(d) || 'Error en crear el producte.';
      setFormError(msg);
    } finally { setSaving(false); }
  }

  // ── Add stock (lot) to existing product — from expanded row ───────────────
  async function handleCreateLot(e) {
    e.preventDefault();
    if (!formLot.ubicacio) { setFormError('Cal seleccionar una ubicació.'); return; }
    setSaving(true); setFormError('');
    try {
      await createLot({ producte: modalLot, ubicacio: formLot.ubicacio, quantitat: formLot.quantitat });
      loadProductes();
      setModalLot(null);
    } catch (err) {
      const d = err.response?.data;
      setFormError(d?.detail || JSON.stringify(d) || 'Error en crear el lot.');
    } finally { setSaving(false); }
  }

  // ── Add stock — standalone modal ──────────────────────────────────────────
  async function handleCreateLotGlobal(e) {
    e.preventDefault();
    if (!formLotGlobal.producte) { setFormError('Cal seleccionar un producte.'); return; }
    if (!formLotGlobal.ubicacio) { setFormError('Cal seleccionar una ubicació.'); return; }
    setSaving(true); setFormError('');
    try {
      await createLot({
        producte: formLotGlobal.producte,
        ubicacio: formLotGlobal.ubicacio,
        quantitat: formLotGlobal.quantitat,
      });
      loadProductes();
      getProductes({ baix_estoc: 'true', ordre: 'estoc_asc', ...magFilter })
        .then(r => setBaixEstoc(r.data.results ?? r.data));
      setModalLotGlobal(false);
    } catch (err) {
      const d = err.response?.data;
      setFormError(d?.detail || JSON.stringify(d) || 'Error en crear el lot.');
    } finally { setSaving(false); }
  }

  function openModalProd() {
    setFormProd(EMPTY_PROD);
    setFormLots([{ ubicacio: '', quantitat: 1 }]);
    setCercaUbic(''); setFormError('');
    setModalProd(true);
  }

  function openModalLot(producteId) {
    setFormLot({ ubicacio: '', quantitat: 1 });
    setCercaUbic(''); setFormError('');
    setModalLot(producteId);
  }

  function openModalLotGlobal() {
    setFormLotGlobal({ producte: '', ubicacio: '', quantitat: 1 });
    setCercaProdGlobal(''); setCercaUbic(''); setFormError('');
    setModalLotGlobal(true);
  }

  if (error) return <div className="state-box state-box--error">{error}</div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">🏷️ Productes</h1>
        <p className="page-subtitle">Catàleg de productes, estoc i ubicacions al magatzem.</p>
      </div>

      {/* ── Alerta estoc baix ── */}
      {baixEstoc.length > 0 && (
        <div className="alert alert--warning" style={{ marginBottom: 20 }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <div>
            <strong>{baixEstoc.length} producte{baixEstoc.length > 1 ? 's' : ''} amb estoc crític (&lt;25 u.):</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {baixEstoc.map(p => (
                <span key={p.id_producte} className="badge badge--red">
                  {p.nom} — {p.estoc_total} u.
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="search-controls">
        <div className="search-bar" style={{ flex: 1 }}>
          <input className="search-input"
            placeholder="Cercar per nom, codi, proveïdor, descripció o ubicació..."
            value={cerca} onChange={e => setCerca(e.target.value)} autoFocus />
          {cerca && <button type="button" className="search-clear" onClick={() => setCerca('')}>✕</button>}
          {loading && cerca && <span style={{ padding: '0 12px', color: '#aab4be', fontSize: '0.85rem' }}>⟳</span>}
        </div>
        <select className="sort-select" value={ordre} onChange={e => setOrdre(e.target.value)}>
          {ORDRES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        {canEdit && (
          <>
            <button className="btn-secondary" onClick={openModalLotGlobal}>+ Nou lot</button>
            <button className="btn-primary" onClick={openModalProd}>+ Nou producte</button>
          </>
        )}
      </div>

      <div className="filter-bar">
        <button className={`filter-btn${!categoria ? ' filter-btn--active' : ''}`} onClick={() => setCategoria('')}>Totes</button>
        {CATEGORIES.map(c => (
          <button key={c} className={`filter-btn${categoria === c ? ' filter-btn--active' : ''}`} onClick={() => setCategoria(c)}>
            {CAT_LABEL[c]}
          </button>
        ))}
      </div>

      {!loading && <p className="result-count">{total.toLocaleString()} productes{cerca && <> · <em>"{cerca}"</em></>}</p>}

      {/* ── Taula ── */}
      {loading && !productes.length ? (
        <div className="state-box">Carregant productes...</div>
      ) : productes.length === 0 ? (
        <div className="state-box">Cap producte trobat.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Codi</th>
                <th>Proveïdor</th>
                <th>Categoria</th>
                <th>Estoc</th>
                <th>Preu</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productes.map(p => (
                <>
                  <tr key={p.id_producte} style={{ cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
                    onClick={() => setExpandit(expandit === p.id_producte ? null : p.id_producte)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.nom}</div>
                      {p.descripcio && (
                        <div style={{ fontSize: '0.82rem', color: '#7f8c8d', marginTop: 2 }}>
                          {p.descripcio.length > 80 ? p.descripcio.slice(0, 80) + '…' : p.descripcio}
                        </div>
                      )}
                    </td>
                    <td className="text-mono">{p.id_producte}</td>
                    <td className="text-mono">{p.codi_proveidor}</td>
                    <td><span className={`badge badge--${CAT_BADGE[p.categoria]}`}>{CAT_LABEL[p.categoria]}</span></td>
                    <td>
                      <span style={{ fontWeight: 700, color: p.estoc_total < 25 ? '#e74c3c' : '#27ae60' }}>
                        {p.estoc_total.toLocaleString()}
                      </span>
                      {p.estoc_total < 25 && ' ⚠️'}
                    </td>
                    <td>{parseFloat(p.preu).toFixed(2)} €</td>
                    <td style={{ color: '#aab4be', fontSize: '0.85rem', textAlign: 'right' }}>
                      {expandit === p.id_producte ? '▲' : '▼'}
                    </td>
                  </tr>
                  {expandit === p.id_producte && (
                    <tr key={`${p.id_producte}-det`}>
                      <td colSpan={7} style={{ background: '#fafbfc', padding: 0 }}>
                        <LotsDetall lots={p.lots} canEdit={canEdit}
                          onAfegirLot={() => openModalLot(p.id_producte)} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal nou producte (amb lots obligatoris) ── */}
      {modalProd && (
        <Modal title="Nou producte" onClose={() => setModalProd(false)}>
          <form onSubmit={handleCreateProducte} className="modal-form">
            <div className="form-row form-row--2">
              <Field label="ID Producte (12 dígits numèrics)" required>
                <input className="login-input" value={formProd.id_producte} maxLength={12}
                  placeholder="000000000000"
                  onChange={e => setFormProd(f => ({ ...f, id_producte: e.target.value }))} required />
              </Field>
              <Field label="Codi proveïdor" required>
                <input className="login-input" value={formProd.codi_proveidor}
                  onChange={e => setFormProd(f => ({ ...f, codi_proveidor: e.target.value }))} required />
              </Field>
            </div>
            <Field label="Nom" required>
              <input className="login-input" value={formProd.nom}
                onChange={e => setFormProd(f => ({ ...f, nom: e.target.value }))} required />
            </Field>
            <Field label="Descripció">
              <textarea className="login-input" rows={2} value={formProd.descripcio}
                onChange={e => setFormProd(f => ({ ...f, descripcio: e.target.value }))}
                style={{ resize: 'vertical' }} />
            </Field>
            <div className="form-row form-row--2">
              <Field label="Categoria">
                <select className="login-input" value={formProd.categoria}
                  onChange={e => setFormProd(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                </select>
              </Field>
              <Field label="Preu (€)" required>
                <input className="login-input" type="number" step="0.01" min="0" value={formProd.preu}
                  onChange={e => setFormProd(f => ({ ...f, preu: e.target.value }))} required />
              </Field>
            </div>
            <Field label="Estoc total inicial">
              <input className="login-input" type="number" min="0" value={formProd.estoc_total}
                onChange={e => setFormProd(f => ({ ...f, estoc_total: parseInt(e.target.value) || 0 }))} />
            </Field>

            {/* Lots inicials — obligatoris */}
            <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label className="login-label">📍 Lots inicials (on s'ubica l'estoc) *</label>
                <button type="button" className="btn-sm btn-sm--edit"
                  onClick={() => setFormLots(ls => [...ls, { ubicacio: '', quantitat: 1 }])}>
                  + Afegir ubicació
                </button>
              </div>

              <Field label="Cercar ubicació">
                <input className="login-input" placeholder="Filtrar per passadís, estant o alçada..."
                  value={cercaUbic} onChange={e => setCercaUbic(e.target.value)} />
              </Field>

              {formLots.map((lot, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}>
                    <label className="login-label" style={{ fontSize: '0.82rem' }}>Ubicació {i + 1}</label>
                    <select className="login-input" value={lot.ubicacio}
                      onChange={e => {
                        const ls = [...formLots]; ls[i] = { ...ls[i], ubicacio: e.target.value };
                        setFormLots(ls);
                      }}>
                      <option value="">— Selecciona —</option>
                      {ubicacions.map(u => (
                        <option key={u.id_ubicacio} value={u.id_ubicacio}>
                          {u.passadis}-{u.estant}-{u.alcada}{u.magatzem_nom ? ` · ${u.magatzem_nom}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="login-label" style={{ fontSize: '0.82rem' }}>Quantitat</label>
                    <input className="login-input" type="number" min="1" value={lot.quantitat}
                      onChange={e => {
                        const ls = [...formLots]; ls[i] = { ...ls[i], quantitat: parseInt(e.target.value) || 1 };
                        setFormLots(ls);
                      }} />
                  </div>
                  {formLots.length > 1 && (
                    <button type="button" className="btn-sm btn-sm--del" style={{ marginBottom: 2 }}
                      onClick={() => setFormLots(ls => ls.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setModalProd(false)}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Creant...' : 'Crear producte'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal nou lot (stock addicional per fila) ── */}
      {modalLot !== null && (
        <Modal title={`Nou lot — ${modalLot}`} onClose={() => setModalLot(null)}>
          <form onSubmit={handleCreateLot} className="modal-form">
            <p style={{ color: '#7f8c8d', fontSize: '0.95rem' }}>
              Afegeix estoc addicional d'aquest producte en una nova ubicació del magatzem.
            </p>
            <Field label="Cercar ubicació">
              <input className="login-input" placeholder="Filtrar per passadís, estant o alçada..."
                value={cercaUbic} onChange={e => setCercaUbic(e.target.value)} />
            </Field>
            <Field label="Ubicació" required>
              <select className="login-input" size={6} value={formLot.ubicacio}
                onChange={e => setFormLot(f => ({ ...f, ubicacio: e.target.value }))}>
                <option value="">— Selecciona ubicació —</option>
                {ubicacions.map(u => (
                  <option key={u.id_ubicacio} value={u.id_ubicacio}>
                    {u.passadis}-{u.estant}-{u.alcada}{u.magatzem_nom ? ` · ${u.magatzem_nom}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantitat" required>
              <input className="login-input" type="number" min="1" value={formLot.quantitat}
                onChange={e => setFormLot(f => ({ ...f, quantitat: parseInt(e.target.value) || 1 }))} required />
            </Field>
            {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setModalLot(null)}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardant...' : 'Afegir stock'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal nou lot global (standalone) ── */}
      {modalLotGlobal && (
        <Modal title="Nou lot — afegir stock" onClose={() => setModalLotGlobal(false)}>
          <form onSubmit={handleCreateLotGlobal} className="modal-form">
            <p style={{ color: '#7f8c8d', fontSize: '0.95rem' }}>
              Afegeix stock d'un producte existent en una ubicació del magatzem.
            </p>

            {/* Producte picker */}
            <Field label="Cercar producte">
              <input className="login-input" placeholder="Nom o codi del producte..."
                value={cercaProdGlobal} onChange={e => setCercaProdGlobal(e.target.value)} />
            </Field>
            <Field label="Producte" required>
              <select className="login-input" size={5} value={formLotGlobal.producte}
                onChange={e => setFormLotGlobal(f => ({ ...f, producte: e.target.value }))}>
                <option value="">— Selecciona producte —</option>
                {prodOptions.map(p => (
                  <option key={p.id_producte} value={p.id_producte}>
                    {p.nom} ({p.id_producte})
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 4 }} />

            {/* Ubicació picker */}
            <Field label="Cercar ubicació">
              <input className="login-input" placeholder="Filtrar per passadís, estant o alçada..."
                value={cercaUbic} onChange={e => setCercaUbic(e.target.value)} />
            </Field>
            <Field label="Ubicació" required>
              <select className="login-input" size={5} value={formLotGlobal.ubicacio}
                onChange={e => setFormLotGlobal(f => ({ ...f, ubicacio: e.target.value }))}>
                <option value="">— Selecciona ubicació —</option>
                {ubicacions.map(u => (
                  <option key={u.id_ubicacio} value={u.id_ubicacio}>
                    {u.passadis}-{u.estant}-{u.alcada}{u.magatzem_nom ? ` · ${u.magatzem_nom}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantitat" required>
              <input className="login-input" type="number" min="1" value={formLotGlobal.quantitat}
                onChange={e => setFormLotGlobal(f => ({ ...f, quantitat: parseInt(e.target.value) || 1 }))} required />
            </Field>
            {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setModalLotGlobal(false)}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardant...' : 'Afegir stock'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function LotsDetall({ lots, canEdit, onAfegirLot }) {
  return (
    <div style={{ padding: '12px 24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#aab4be', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Ubicacions ({lots?.length ?? 0})
        </span>
        {canEdit && (
          <button className="btn-sm btn-sm--edit" onClick={e => { e.stopPropagation(); onAfegirLot(); }}>
            + Nou stock
          </button>
        )}
      </div>
      {!lots?.length ? (
        <span style={{ color: '#aab4be' }}>Sense lots assignats.</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {lots.map((l, i) => (
            <span key={i} style={{
              background: '#f0f2f5', borderRadius: 6, padding: '5px 12px',
              fontFamily: 'monospace', fontSize: '0.88rem', color: '#2c3e50',
            }}>
              📍 {l.ubicacio_codi} &nbsp;×{l.quantitat}
              <span style={{ marginLeft: 8, color: '#aab4be', fontFamily: 'inherit' }}>{l.data_entrada}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 580 }}>
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
