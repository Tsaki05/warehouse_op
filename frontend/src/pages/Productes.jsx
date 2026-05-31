import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFilter } from '../contexts/FilterContext';
import { getMagatzems, getProductes, getUbicacions, createProducte, createLot } from '../api/api';
import { useDebounce } from '../hooks/useDebounce';
import MagatzemAutocomplete from '../components/MagatzemAutocomplete';

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
const EMPTY_LOT = { magatzemObj: null, ubicacioObj: null, quantitat: 1 };

export default function Productes() {
  const location       = useLocation();
  const { user }       = useAuth();
  const { magFiltrat } = useFilter();
  const isAdmin        = user?.rol === 'admin';
  const canEdit        = isAdmin || user?.rol === 'superior';

  const [productes, setProductes]   = useState([]);
  const [baixEstoc, setBaixEstoc]   = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [expandit, setExpandit]     = useState(null);

  const [cerca, setCerca]               = useState('');
  const [categories, setCategories]     = useState(new Set());
  const [ordre, setOrdre]               = useState('nom');
  const [baixEstocFiltrat, setBaixEstocFiltrat] = useState(
    () => new URLSearchParams(location.search).get('baix_estoc') === 'true'
  );
  const cercaDb = useDebounce(cerca, 350);

  // modals
  const [modalProd, setModalProd]           = useState(false);
  const [modalLot, setModalLot]             = useState(null);
  const [modalLotGlobal, setModalLotGlobal] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [formError, setFormError]           = useState('');

  // form states
  const [formProd, setFormProd]         = useState(EMPTY_PROD);
  const [formLots, setFormLots]         = useState([{ ...EMPTY_LOT }]);
  const [formLot, setFormLot]           = useState({ ...EMPTY_LOT });
  const [formLotGlobal, setFormLotGlobal] = useState({ producteObj: null, ...EMPTY_LOT });

  // magatzems per als pickers d'admin (lazy, una sola càrrega)
  const [magatzemsOpts, setMagatzemsOpts]   = useState([]);
  const [magatzemsLoaded, setMagatzemsLoaded] = useState(false);

  const magIds        = magFiltrat.map(m => m.codi_magatzem);
  const magFilter     = magIds.length > 0 ? { magatzem_filter: magIds } : {};
  const rows          = expandPerMag(productes);
  const baixEstocRows = expandPerMag(baixEstoc).filter(r => r._estoc < 25);
  const displayRows   = baixEstocFiltrat ? rows.filter(r => r._estoc < 25) : rows;

  function ensureMagatzems() {
    if (!isAdmin || magatzemsLoaded) return;
    setMagatzemsLoaded(true);
    getMagatzems()
      .then(res => setMagatzemsOpts(res.data.results ?? res.data))
      .catch(() => {});
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadProductes = useCallback(() => {
    setLoading(true);
    getProductes({
      cerca: cercaDb || undefined,
      categoria: categories.size > 0 ? [...categories] : undefined,
      ordre,
      baix_estoc: baixEstocFiltrat ? 'true' : undefined,
      ...magFilter,
    })
      .then(res => {
        setProductes(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError("No s'ha pogut carregar els productes."))
      .finally(() => setLoading(false));
  }, [cercaDb, categories, ordre, baixEstocFiltrat, magFiltrat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProductes(); }, [loadProductes]);

  useEffect(() => {
    getProductes({ baix_estoc: 'true', ordre: 'estoc_asc', ...magFilter })
      .then(res => setBaixEstoc(res.data.results ?? res.data))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magFiltrat]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleCreateProducte(e) {
    e.preventDefault();
    if (formLots.some(l => !l.ubicacioObj)) {
      setFormError('Cal seleccionar ubicació per a cada lot.'); return;
    }
    setSaving(true); setFormError('');
    try {
      const lots = formLots.map(l => ({ ubicacio: l.ubicacioObj.id_ubicacio, quantitat: l.quantitat }));
      await createProducte({ ...formProd, lots });
      loadProductes();
      getProductes({ baix_estoc: 'true', ordre: 'estoc_asc', ...magFilter })
        .then(r => setBaixEstoc(r.data.results ?? r.data));
      setModalProd(false);
    } catch (err) {
      const d = err.response?.data;
      setFormError(d?.lots?.[0] || d?.detail || JSON.stringify(d) || 'Error en crear el producte.');
    } finally { setSaving(false); }
  }

  async function handleCreateLot(e) {
    e.preventDefault();
    if (!formLot.ubicacioObj) { setFormError('Cal seleccionar una ubicació.'); return; }
    setSaving(true); setFormError('');
    try {
      await createLot({ producte: modalLot, ubicacio: formLot.ubicacioObj.id_ubicacio, quantitat: formLot.quantitat });
      loadProductes();
      setModalLot(null);
    } catch (err) {
      const d = err.response?.data;
      setFormError(d?.detail || JSON.stringify(d) || 'Error en crear el lot.');
    } finally { setSaving(false); }
  }

  async function handleCreateLotGlobal(e) {
    e.preventDefault();
    if (!formLotGlobal.producteObj) { setFormError('Cal seleccionar un producte.'); return; }
    if (!formLotGlobal.ubicacioObj) { setFormError('Cal seleccionar una ubicació.'); return; }
    setSaving(true); setFormError('');
    try {
      await createLot({
        producte: formLotGlobal.producteObj.id_producte,
        ubicacio: formLotGlobal.ubicacioObj.id_ubicacio,
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
    setFormLots([{ ...EMPTY_LOT }]);
    setFormError('');
    setModalProd(true);
    ensureMagatzems();
  }

  function openModalLot(producteId) {
    setFormLot({ ...EMPTY_LOT });
    setFormError('');
    setModalLot(producteId);
    ensureMagatzems();
  }

  function openModalLotGlobal() {
    setFormLotGlobal({ producteObj: null, ...EMPTY_LOT });
    setFormError('');
    setModalLotGlobal(true);
    ensureMagatzems();
  }

  function activarFiltreBaixEstoc() {
    setBaixEstocFiltrat(true);
    setExpandit(null);
    setCerca('');
    setCategories(new Set());
  }

  if (error) return <div className="state-box state-box--error">{error}</div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">🏷️ Productes</h1>
        <p className="page-subtitle">Catàleg de productes, estoc i ubicacions al magatzem.</p>
      </div>

      {/* ── Alerta estoc baix ── */}
      {baixEstocRows.length > 0 && (
        <div className="alert alert--warning" style={{ marginBottom: 20 }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <div>
            <strong>
              {baixEstocRows.length} línia{baixEstocRows.length > 1 ? 'es' : ''} amb estoc crític (&le; 25 unitats):
            </strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {baixEstocRows.slice(0, 3).map(row => (
                <button
                  key={row._rowKey}
                  type="button"
                  className="badge badge--red"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => activarFiltreBaixEstoc()}
                  title="Clica per filtrar estoc crític"
                >
                  {row.nom}{row._magatzem_nom ? ` · ${row._magatzem_nom}` : ''} — {row._estoc} u.
                </button>
              ))}
              {baixEstocRows.length > 3 && (
                <button
                  type="button"
                  className="badge badge--red"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => activarFiltreBaixEstoc()}
                >
                  +{baixEstocRows.length - 3} més...
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="search-controls">
        <div className="search-bar" style={{ flex: 1 }}>
          <input className="search-input"
            placeholder="Cercar per nom, codi, proveïdor, descripció, ubicació o magatzem..."
            value={cerca} onChange={e => { setCerca(e.target.value); setBaixEstocFiltrat(false); setCategories(new Set()); }} autoFocus />
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
        {CATEGORIES.map(c => (
          <button key={c}
            className={`filter-btn${categories.has(c) && !baixEstocFiltrat ? ' filter-btn--active' : ''}`}
            onClick={() => {
              setBaixEstocFiltrat(false);
              setCategories(prev => {
                const next = new Set(prev);
                next.has(c) ? next.delete(c) : next.add(c);
                return next;
              });
            }}>
            {CAT_LABEL[c]}
          </button>
        ))}
        {baixEstocFiltrat && (
          <button
            className="filter-btn filter-btn--active"
            style={{ color: '#e74c3c' }}
            onClick={() => setBaixEstocFiltrat(false)}
            title="Treure filtre d'estoc crític">
            ⚠️ Estoc crític ✕
          </button>
        )}
      </div>

      {!loading && (
        <p className="result-count">
          {total.toLocaleString()} productes{cerca && <> · <em>"{cerca}"</em></>}
        </p>
      )}

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
              {displayRows.flatMap(row => {
                const mainRow = (
                  <tr
                    key={row._rowKey}
                    style={{ cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
                    onClick={() => setExpandit(expandit === row._rowKey ? null : row._rowKey)}
                  >
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.nom}</div>
                      {row._magatzem_nom && (
                        <span style={{
                          display: 'inline-block', background: '#eaf4fb', color: '#2980b9',
                          borderRadius: 4, padding: '1px 6px', fontSize: '0.72rem',
                          fontWeight: 600, marginTop: 3,
                        }}>{row._magatzem_nom}</span>
                      )}
                      {row.descripcio && (
                        <div style={{ fontSize: '0.82rem', color: '#7f8c8d', marginTop: 2 }}>
                          {row.descripcio.length > 80 ? row.descripcio.slice(0, 80) + '…' : row.descripcio}
                        </div>
                      )}
                    </td>
                    <td className="text-mono">{row.id_producte}</td>
                    <td className="text-mono">{row.codi_proveidor}</td>
                    <td><span className={`badge badge--${CAT_BADGE[row.categoria]}`}>{CAT_LABEL[row.categoria]}</span></td>
                    <td>
                      <span style={{ fontWeight: 700, color: row._estoc < 25 ? '#e74c3c' : '#27ae60' }}>
                        {row._estoc.toLocaleString()}
                      </span>
                      {row._estoc < 25 && ' ⚠️'}
                    </td>
                    <td>{parseFloat(row.preu).toFixed(2)} €</td>
                    <td style={{ color: '#aab4be', fontSize: '0.85rem', textAlign: 'right' }}>
                      {expandit === row._rowKey ? '▲' : '▼'}
                    </td>
                  </tr>
                );
                if (expandit !== row._rowKey) return [mainRow];
                return [
                  mainRow,
                  <tr key={`${row._rowKey}-det`}>
                    <td colSpan={7} style={{ background: '#fafbfc', padding: 0 }}>
                      <LotsDetall lots={row._lots} canEdit={canEdit}
                        onAfegirLot={() => openModalLot(row.id_producte)} />
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal nou producte ── */}
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

            <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label className="login-label">📍 Lots inicials (on s'ubica l'estoc) *</label>
                <button type="button" className="btn-sm btn-sm--edit"
                  onClick={() => setFormLots(ls => [...ls, { ...EMPTY_LOT }])}>
                  + Afegir lot
                </button>
              </div>
              {formLots.map((lot, i) => (
                <div key={i} style={{
                  background: '#f8f9fa', borderRadius: 8, padding: '12px 12px 8px',
                  marginTop: 8, position: 'relative',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7f8c8d' }}>Lot {i + 1}</span>
                    {formLots.length > 1 && (
                      <button type="button" className="btn-sm btn-sm--del"
                        onClick={() => setFormLots(ls => ls.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </div>
                  <UbicacioPicker
                    isAdmin={isAdmin}
                    magatzemsOpts={magatzemsOpts}
                    magFilter={magFilter}
                    value={lot}
                    onChange={v => setFormLots(ls => {
                      const n = [...ls]; n[i] = { ...n[i], ...v }; return n;
                    })}
                  />
                  <Field label="Quantitat">
                    <input className="login-input" type="number" min="1" value={lot.quantitat}
                      onChange={e => setFormLots(ls => {
                        const n = [...ls]; n[i] = { ...n[i], quantitat: parseInt(e.target.value) || 1 }; return n;
                      })} />
                  </Field>
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

      {/* ── Modal nou lot (per fila) ── */}
      {modalLot !== null && (
        <Modal title={`Nou lot — ${modalLot}`} onClose={() => setModalLot(null)}>
          <form onSubmit={handleCreateLot} className="modal-form">
            <p style={{ color: '#7f8c8d', fontSize: '0.95rem' }}>
              Afegeix estoc addicional d'aquest producte en una nova ubicació del magatzem.
            </p>
            <UbicacioPicker
              isAdmin={isAdmin}
              magatzemsOpts={magatzemsOpts}
              magFilter={magFilter}
              value={formLot}
              onChange={v => setFormLot(f => ({ ...f, ...v }))}
            />
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

      {/* ── Modal nou lot global ── */}
      {modalLotGlobal && (
        <Modal title="Nou lot — afegir stock" onClose={() => setModalLotGlobal(false)}>
          <form onSubmit={handleCreateLotGlobal} className="modal-form">
            <p style={{ color: '#7f8c8d', fontSize: '0.95rem' }}>
              Afegeix stock d'un producte existent en una ubicació del magatzem.
            </p>
            <Field label="Producte" required>
              <ProducteAutocomplete
                value={formLotGlobal.producteObj}
                onChange={p => setFormLotGlobal(f => ({ ...f, producteObj: p }))}
                magFilter={magFilter}
              />
            </Field>
            <div style={{ borderTop: '1px solid #f0f2f5', margin: '4px 0' }} />
            <UbicacioPicker
              isAdmin={isAdmin}
              magatzemsOpts={magatzemsOpts}
              magFilter={magFilter}
              value={formLotGlobal}
              onChange={v => setFormLotGlobal(f => ({ ...f, ...v }))}
            />
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

function expandPerMag(productes) {
  const rows = [];
  for (const p of productes) {
    const mags = p.estoc_per_magatzem ?? [];
    if (mags.length === 0) {
      rows.push({
        ...p,
        _rowKey:      p.id_producte,
        _magatzem_id: null,
        _magatzem_nom: null,
        _lots:        p.lots ?? [],
        _estoc:       p.estoc_total,
      });
    } else {
      for (const mag of mags) {
        rows.push({
          ...p,
          _rowKey:      `${p.id_producte}__${mag.magatzem_id}`,
          _magatzem_id: mag.magatzem_id,
          _magatzem_nom: mag.magatzem_nom,
          _lots:        (p.lots ?? []).filter(l => l.magatzem_id === mag.magatzem_id),
          _estoc:       mag.estoc,
        });
      }
    }
  }
  return rows;
}

// ── UbicacioPicker: admin veu magatzem + ubicació, altres només ubicació ──────
function UbicacioPicker({ isAdmin, magatzemsOpts, magFilter, value, onChange }) {
  return (
    <div>
      {isAdmin && (
        <Field label="Magatzem">
          <MagatzemAutocomplete
            magatzems={magatzemsOpts}
            value={value.magatzemObj}
            onChange={m => onChange({ magatzemObj: m, ubicacioObj: null })}
            placeholder="Selecciona magatzem..."
          />
        </Field>
      )}
      <Field label="Ubicació" required>
        <UbicacioAutocomplete
          key={isAdmin ? (value.magatzemObj?.codi_magatzem ?? 'no-mag') : 'fixed'}
          value={value.ubicacioObj}
          onChange={u => onChange({ ubicacioObj: u })}
          magatzemId={isAdmin ? value.magatzemObj?.codi_magatzem ?? null : null}
          magFilter={isAdmin ? {} : magFilter}
          disabled={isAdmin && !value.magatzemObj}
          placeholder={isAdmin && !value.magatzemObj ? 'Selecciona primer un magatzem...' : 'Cercar ubicació...'}
        />
      </Field>
    </div>
  );
}

// ── UbicacioAutocomplete: cerca a la API amb debounce ─────────────────────────
function UbicacioAutocomplete({ value, onChange, magatzemId, magFilter = {}, disabled = false, placeholder }) {
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
    if (!open || disabled) return;
    setLoading(true);
    const params = { cerca: queryDb || undefined, ...magFilter };
    if (magatzemId) params.magatzem = magatzemId;
    getUbicacions(params)
      .then(res => setOptions(res.data.results ?? res.data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDb, open, magatzemId, disabled]);

  const displayText = value ? `${value.passadis}-${value.estant}-${value.alcada}` : '';

  return (
    <div className="mag-auto" ref={ref} style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : {}}>
      <div className="mag-auto-wrap">
        <input
          className="mag-auto-input"
          placeholder={displayText || placeholder || 'Cercar ubicació...'}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => !disabled && setOpen(true)}
          disabled={disabled}
        />
        {value && (
          <button type="button" className="mag-auto-clear"
            onMouseDown={e => { e.stopPropagation(); onChange(null); setQuery(''); setOpen(false); }}>
            ✕
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className="mag-auto-dropdown">
          {loading ? (
            <div className="mag-auto-empty">Carregant...</div>
          ) : options.length === 0 ? (
            <div className="mag-auto-empty">Cap ubicació trobada</div>
          ) : options.map(u => (
            <div key={u.id_ubicacio} className="mag-auto-opt"
              onMouseDown={() => { onChange(u); setQuery(''); setOpen(false); }}>
              <span className="mag-auto-opt-nom text-mono">{u.passadis}-{u.estant}-{u.alcada}</span>
              {u.magatzem_nom && <span className="mag-auto-opt-cod">{u.magatzem_nom}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ProducteAutocomplete: cerca a la API amb debounce ─────────────────────────
function ProducteAutocomplete({ value, onChange, magFilter = {}, placeholder = 'Cercar producte...' }) {
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
    getProductes({ cerca: queryDb || undefined, ...magFilter })
      .then(res => setOptions(res.data.results ?? res.data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDb, open]);

  const displayText = value ? value.nom : '';

  return (
    <div className="mag-auto" ref={ref}>
      <div className="mag-auto-wrap">
        <input
          className="mag-auto-input"
          placeholder={displayText || placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {value && (
          <button type="button" className="mag-auto-clear"
            onMouseDown={e => { e.stopPropagation(); onChange(null); setQuery(''); setOpen(false); }}>
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="mag-auto-dropdown">
          {loading ? (
            <div className="mag-auto-empty">Carregant...</div>
          ) : options.length === 0 ? (
            <div className="mag-auto-empty">Cap producte trobat</div>
          ) : options.map(p => (
            <div key={p.id_producte} className="mag-auto-opt"
              onMouseDown={() => { onChange(p); setQuery(''); setOpen(false); }}>
              <span className="mag-auto-opt-nom">{p.nom}</span>
              <span className="mag-auto-opt-cod text-mono">{p.id_producte}</span>
            </div>
          ))}
        </div>
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
