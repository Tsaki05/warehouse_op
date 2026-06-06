import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/context/AuthContext';
import { useFilter } from '../../../shared/contexts/FilterContext';
import { getMagatzems, getUbicacions, createUbicacio, deleteUbicacio, createMagatzem, deleteMagatzem, createUbicacionsBulk } from '../api/inventariApi';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import MagatzemAutocomplete from '../components/MagatzemAutocomplete';

const EMPTY_FORM = { passadis: '', estant: '', alcada: '' };

export default function MagatzemsUbicacions() {
  const { user } = useAuth();
  const { magFiltrat, setMagFiltrat } = useFilter();
  const canEdit  = user?.rol === 'admin' || user?.rol === 'superior';
  const isAdmin  = user?.rol === 'admin';

  const [modalMag, setModalMag]     = useState(false);
  const [nomMag, setNomMag]         = useState('');
  const [savingMag, setSavingMag]   = useState(false);
  const [errorMag, setErrorMag]     = useState('');
  const [createdMag, setCreatedMag] = useState(null);

  const [modalDelMag, setModalDelMag] = useState(null); // objecte magatzem a eliminar
  const [deletingMag, setDeletingMag] = useState(false);
  const [errorDelMag, setErrorDelMag] = useState('');

  async function handleDeleteMagatzem() {
    setDeletingMag(true); setErrorDelMag('');
    try {
      await deleteMagatzem(modalDelMag.codi_magatzem);
      setMagFiltrat(prev => prev.filter(m => m.codi_magatzem !== modalDelMag.codi_magatzem));
      setModalDelMag(null);
    } catch (err) {
      setErrorDelMag(err.response?.data?.detail || "No s'ha pogut eliminar el magatzem.");
    } finally { setDeletingMag(false); }
  }

  function openModalMag() {
    setNomMag(''); setErrorMag(''); setCreatedMag(null); setModalMag(true);
  }

  async function handleCreateMagatzem(e) {
    e.preventDefault();
    setSavingMag(true); setErrorMag('');
    try {
      const res = await createMagatzem({ nom: nomMag });
      setCreatedMag(res.data);
      window.dispatchEvent(new Event('magatzem-creat'));
    } catch (err) {
      const d = err.response?.data;
      setErrorMag(d?.nom?.[0] || d?.detail || JSON.stringify(d) || "Error en crear el magatzem.");
    } finally { setSavingMag(false); }
  }

  const header = (
    <div className="page-header" style={{ marginBottom: 16 }}>
      <div>
        <h1 className="page-title">🏢 Magatzems i Ubicacions</h1>
        <p className="page-subtitle">Gestió d'ubicacions per magatzem.</p>
      </div>
      {isAdmin && (
        <button className="btn-primary" onClick={openModalMag}>+ Nou magatzem</button>
      )}
    </div>
  );

  return (
    <div>
      {header}

      {magFiltrat.length === 0
        ? <AllUbicacionsPanel canEdit={canEdit} />
        : magFiltrat.map(mag => (
            <div key={mag.codi_magatzem} style={{ marginBottom: 32 }}>
              <div className="section-card" style={{ marginBottom: 12 }}>
                <div className="section-card-header">
                  <span className="section-card-title">🏢 {mag.nom || 'Magatzem'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="section-card-count text-mono">{mag.codi_magatzem}</span>
                    {isAdmin && (
                      <button
                        className="btn-sm btn-sm--del"
                        onClick={() => { setErrorDelMag(''); setModalDelMag(mag); }}
                      >
                        Eliminar magatzem
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <UbicacionsPanel magatzemId={mag.codi_magatzem} canEdit={canEdit} />
            </div>
          ))
      }

      {modalDelMag && (
        <Modal title="Eliminar magatzem" onClose={() => setModalDelMag(null)}>
          <div className="modal-form">
            <p>
              Segur que vols eliminar el magatzem{' '}
              <strong>{modalDelMag.nom || modalDelMag.codi_magatzem}</strong>
              {' '}(<span className="text-mono">{modalDelMag.codi_magatzem}</span>)?
            </p>
            <p style={{ marginTop: 8, color: '#7f8c8d', fontSize: '0.9rem' }}>
              S'eliminaran totes les seves ubicacions. No es podrà eliminar si hi ha lots de productes assignats.
            </p>
            {errorDelMag && (
              <div className="login-error" style={{ marginTop: 12 }}>
                <span>⚠️</span> {errorDelMag}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setModalDelMag(null)}>Cancel·lar</button>
              <button className="btn-danger" onClick={handleDeleteMagatzem} disabled={deletingMag}>
                {deletingMag ? 'Eliminant...' : 'Eliminar magatzem'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalMag && (
        <Modal title="Nou magatzem" onClose={() => setModalMag(false)}>
          {createdMag ? (
            <div className="modal-form">
              <div className="alert alert--info">
                <span>✅</span>
                <span>
                  Magatzem creat correctament.{' '}
                  Codi assignat:{' '}
                  <strong className="text-mono">{createdMag.codi_magatzem}</strong>
                  {createdMag.nom && <> · {createdMag.nom}</>}
                </span>
              </div>
              <p style={{ color: '#7f8c8d', fontSize: '0.9rem', marginTop: 8 }}>
                Usa el filtre de magatzem de la barra lateral per veure'l i gestionar-ne les ubicacions.
              </p>
              <div className="modal-actions">
                <button className="btn-primary" onClick={() => setModalMag(false)}>Tancar</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateMagatzem} className="modal-form">
              <Field label="Nom del magatzem" required>
                <input
                  className="login-input"
                  value={nomMag}
                  maxLength={100}
                  placeholder="p.ex. Magatzem Central Nord"
                  onChange={e => setNomMag(e.target.value)}
                  required
                  autoFocus
                />
              </Field>
              <div className="alert alert--info">
                <span>ℹ️</span>
                <span>El codi identificador de 8 caràcters s'autogenera automàticament.</span>
              </div>
              {errorMag && <div className="login-error"><span>⚠️</span> {errorMag}</div>}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setModalMag(false)}>Cancel·lar</button>
                <button type="submit" className="btn-primary" disabled={savingMag || !nomMag.trim()}>
                  {savingMag ? 'Creant...' : 'Crear magatzem'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}

function AllUbicacionsPanel({ canEdit }) {
  const [ubicacions, setUbicacions] = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [cerca, setCerca]           = useState('');
  const cercaDb                     = useDebounce(cerca, 350);

  const [modalNova, setModalNova] = useState(false);
  const [modalDel, setModalDel]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  const fetchMagatzems = useCallback(
    q => getMagatzems({ cerca: q || undefined, page_size: 50 })
           .then(res => res.data.results ?? res.data),
    []
  );

  const load = useCallback(() => {
    setLoading(true);
    getUbicacions({ cerca: cercaDb || undefined })
      .then(res => {
        const list = res.data.results ?? res.data;
        setUbicacions(list);
        setTotal(res.data.count ?? list.length);
      })
      .finally(() => setLoading(false));
  }, [cercaDb]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    setSaving(true); setFormError('');
    try {
      await deleteUbicacio(modalDel.id_ubicacio);
      load();
      setModalDel(null);
    } catch (err) {
      const d = err.response?.data;
      setFormError(d?.detail || "No s'ha pogut eliminar la ubicació.");
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="search-controls">
        <div className="search-bar" style={{ flex: 1 }}>
          <input className="search-input"
            placeholder="Cercar per passadís, estant o alçada..."
            value={cerca} onChange={e => setCerca(e.target.value)} />
          {cerca && <button type="button" className="search-clear" onClick={() => setCerca('')}>✕</button>}
          {loading && cerca && <span style={{ padding: '0 12px', color: '#aab4be', fontSize: '0.85rem' }}>⟳</span>}
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setModalNova(true)}>+ Nova ubicació</button>
        )}
      </div>

      <p className="result-count">
        {total > 200
          ? `Mostrant 200 de ${total.toLocaleString()} ubicacions (tots els magatzems)`
          : `${ubicacions.length} ubicacions (tots els magatzems)`}
        {cerca && <> · cerca: <em>"{cerca}"</em></>}
      </p>

      {loading && !ubicacions.length ? (
        <div className="state-box">Carregant ubicacions...</div>
      ) : ubicacions.length === 0 ? (
        <div className="state-box">Cap ubicació trobada{cerca ? ' amb aquesta cerca' : ''}.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Magatzem</th>
                <th>Codi</th>
                <th>Passadís</th>
                <th>Estant</th>
                <th>Alçada</th>
                {canEdit && <th>Accions</th>}
              </tr>
            </thead>
            <tbody>
              {ubicacions.map(u => (
                <tr key={u.id_ubicacio}>
                  <td>{u.magatzem_nom || u.magatzem}</td>
                  <td className="text-mono" style={{ fontWeight: 700 }}>
                    {u.passadis}-{u.estant}-{u.alcada}
                  </td>
                  <td className="text-mono">{u.passadis}</td>
                  <td className="text-mono">{u.estant}</td>
                  <td className="text-mono">{u.alcada}</td>
                  {canEdit && (
                    <td>
                      <button className="btn-sm btn-sm--del"
                        onClick={() => { setFormError(''); setModalDel(u); }}>
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalNova && (
        <ModalNovaUbicacio
          fetchMagatzems={fetchMagatzems}
          onClose={() => setModalNova(false)}
          onCreated={load}
        />
      )}

      {modalDel && (
        <Modal title="Eliminar ubicació" onClose={() => setModalDel(null)}>
          <div className="modal-form">
            <p>
              Segur que vols eliminar la ubicació{' '}
              <strong className="text-mono">{modalDel.passadis}-{modalDel.estant}-{modalDel.alcada}</strong>?
            </p>
            <p style={{ marginTop: 8, color: '#7f8c8d', fontSize: '0.9rem' }}>
              No es podrà eliminar si té lots de productes assignats.
            </p>
            {formError && <div className="login-error" style={{ marginTop: 12 }}><span>⚠️</span> {formError}</div>}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setModalDel(null)}>Cancel·lar</button>
              <button className="btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? 'Eliminant...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function UbicacionsPanel({ magatzemId, canEdit }) {
  const [ubicacions, setUbicacions] = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [cerca, setCerca]           = useState('');
  const cercaDb                     = useDebounce(cerca, 350);

  const [modalNova, setModalNova] = useState(false);
  const [modalDel, setModalDel]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getUbicacions({ magatzem: magatzemId, cerca: cercaDb || undefined })
      .then(res => {
        const list = res.data.results ?? res.data;
        setUbicacions(list);
        setTotal(res.data.count ?? list.length);
      })
      .finally(() => setLoading(false));
  }, [magatzemId, cercaDb]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    setSaving(true); setFormError('');
    try {
      await deleteUbicacio(modalDel.id_ubicacio);
      load();
      setModalDel(null);
    } catch (err) {
      const d = err.response?.data;
      setFormError(d?.detail || "No s'ha pogut eliminar la ubicació.");
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="search-controls">
        <div className="search-bar" style={{ flex: 1 }}>
          <input className="search-input"
            placeholder="Cercar per passadís, estant o alçada..."
            value={cerca} onChange={e => setCerca(e.target.value)} />
          {cerca && <button type="button" className="search-clear" onClick={() => setCerca('')}>✕</button>}
          {loading && cerca && <span style={{ padding: '0 12px', color: '#aab4be', fontSize: '0.85rem' }}>⟳</span>}
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setModalNova(true)}>
            + Nova ubicació
          </button>
        )}
      </div>

      <p className="result-count">
        {total > 200
          ? `Mostrant 200 de ${total.toLocaleString()} ubicacions`
          : `${ubicacions.length} ubicacions`}
        {cerca && <> · cerca: <em>"{cerca}"</em></>}
      </p>

      {loading && !ubicacions.length ? (
        <div className="state-box">Carregant ubicacions...</div>
      ) : ubicacions.length === 0 ? (
        <div className="state-box">Cap ubicació trobada{cerca ? ' amb aquesta cerca' : ''}.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Codi</th>
                <th>Passadís</th>
                <th>Estant</th>
                <th>Alçada</th>
                {canEdit && <th>Accions</th>}
              </tr>
            </thead>
            <tbody>
              {ubicacions.map(u => (
                <tr key={u.id_ubicacio}>
                  <td className="text-mono" style={{ fontWeight: 700 }}>
                    {u.passadis}-{u.estant}-{u.alcada}
                  </td>
                  <td className="text-mono">{u.passadis}</td>
                  <td className="text-mono">{u.estant}</td>
                  <td className="text-mono">{u.alcada}</td>
                  {canEdit && (
                    <td>
                      <button className="btn-sm btn-sm--del"
                        onClick={() => { setFormError(''); setModalDel(u); }}>
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalNova && (
        <ModalNovaUbicacio
          magatzemFixe={magatzemId}
          onClose={() => setModalNova(false)}
          onCreated={load}
        />
      )}

      {modalDel && (
        <Modal title="Eliminar ubicació" onClose={() => setModalDel(null)}>
          <div className="modal-form">
            <p>
              Segur que vols eliminar la ubicació{' '}
              <strong className="text-mono">{modalDel.passadis}-{modalDel.estant}-{modalDel.alcada}</strong>?
            </p>
            <p style={{ marginTop: 8, color: '#7f8c8d', fontSize: '0.9rem' }}>
              No es podrà eliminar si té lots de productes assignats.
            </p>
            {formError && <div className="login-error" style={{ marginTop: 12 }}><span>⚠️</span> {formError}</div>}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setModalDel(null)}>Cancel·lar</button>
              <button className="btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? 'Eliminant...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Tabbed modal: Unitària | Per passadís ─────────────────────────────────────

function ModalNovaUbicacio({ magatzemFixe = null, fetchMagatzems, onClose, onCreated }) {
  const [tab, setTab] = useState('unitaria');

  // Shared magatzem selector (used in both tabs when magatzemFixe is null)
  const [magatzemSel, setMagatzemSel] = useState(null);

  // Unitaria tab
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');

  // Bulk tab
  const [passadis, setPassadis]     = useState('');
  const [estDe, setEstDe]           = useState('001');
  const [estFins, setEstFins]       = useState('009');
  const [alcDe, setAlcDe]           = useState('00A');
  const [alcFins, setAlcFins]       = useState('00D');
  const [savingBulk, setSavingBulk] = useState(false);
  const [bulkError, setBulkError]   = useState('');
  const [bulkResult, setBulkResult] = useState(null);

  const magId = magatzemFixe || magatzemSel?.codi_magatzem;

  async function handleCreate(e) {
    e.preventDefault();
    if (!magId) { setFormError('Has de seleccionar un magatzem.'); return; }
    setSaving(true); setFormError('');
    try {
      await createUbicacio({ ...form, magatzem: magId });
      onCreated?.();
      onClose();
    } catch (err) {
      const d = err.response?.data;
      setFormError(
        d?.passadis?.[0] || d?.estant?.[0] || d?.alcada?.[0] || d?.detail
        || d?.non_field_errors?.[0] || JSON.stringify(d) || 'Error en crear la ubicació.'
      );
    } finally { setSaving(false); }
  }

  async function handleBulk(e) {
    e.preventDefault();
    if (!magId) { setBulkError('Has de seleccionar un magatzem.'); return; }
    const passUpper = passadis.toUpperCase();
    const estRes = generarCodisRang(estDe, estFins);
    const alcRes = generarCodisRang(alcDe, alcFins);
    const combinacions = estRes.codis.flatMap(est =>
      alcRes.codis.map(alc => ({ estant: est, alcada: alc }))
    );
    setSavingBulk(true); setBulkError('');
    try {
      const res = await createUbicacionsBulk({ magatzem: magId, passadis: passUpper, combinacions });
      setBulkResult(res.data.created);
      onCreated?.();
    } catch (err) {
      setBulkError(err.response?.data?.detail || 'Error en crear les ubicacions.');
    } finally { setSavingBulk(false); }
  }

  const preview = list => {
    if (!list.length) return '—';
    const shown = list.slice(0, 6).join(', ');
    return list.length > 6 ? `${shown} … (${list.length})` : shown;
  };

  const estRes     = generarCodisRang(estDe, estFins);
  const alcRes     = generarCodisRang(alcDe, alcFins);
  const totalBulk  = estRes.codis.length * alcRes.codis.length;
  const passUpper  = passadis.toUpperCase();
  const passValid  = /^[A-Z0-9]{3}$/.test(passUpper);
  const canBulk    = magId && passValid && !estRes.error && !alcRes.error && totalBulk > 0;

  const tabStyle = active => ({
    padding: '8px 18px',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #3498db' : '2px solid transparent',
    marginBottom: -2,
    fontWeight: active ? 700 : 400,
    color: active ? '#3498db' : '#7f8c8d',
    cursor: 'pointer',
    fontSize: '0.95rem',
  });

  return (
    <Modal title="Nova ubicació" onClose={onClose}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
        <button type="button" style={tabStyle(tab === 'unitaria')} onClick={() => setTab('unitaria')}>
          Unitària
        </button>
        <button type="button" style={tabStyle(tab === 'passadis')} onClick={() => setTab('passadis')}>
          Per passadís
        </button>
      </div>

      {/* ── Tab: Unitària ── */}
      {tab === 'unitaria' && (
        <form onSubmit={handleCreate} className="modal-form">
          {!magatzemFixe && (
            <Field label="Magatzem" required>
              <MagatzemAutocomplete
                fetchOptions={fetchMagatzems}
                value={magatzemSel}
                onChange={setMagatzemSel}
                placeholder="Selecciona un magatzem..."
              />
            </Field>
          )}
          <p style={{ color: '#7f8c8d', fontSize: '0.95rem', marginTop: 4 }}>
            Cada camp ha de tenir exactament <strong>3 caràcters alfanumèrics</strong>.
          </p>
          <div className="form-row form-row--2" style={{ gap: 12 }}>
            <Field label="Passadís (3 car.)" required>
              <input className="login-input" value={form.passadis} maxLength={3}
                placeholder="A01"
                onChange={e => setForm(f => ({ ...f, passadis: e.target.value.toUpperCase() }))} required />
            </Field>
            <Field label="Estant (3 car.)" required>
              <input className="login-input" value={form.estant} maxLength={3}
                placeholder="001"
                onChange={e => setForm(f => ({ ...f, estant: e.target.value.toUpperCase() }))} required />
            </Field>
            <Field label="Alçada (3 car.)" required>
              <input className="login-input" value={form.alcada} maxLength={3}
                placeholder="00A"
                onChange={e => setForm(f => ({ ...f, alcada: e.target.value.toUpperCase() }))} required />
            </Field>
          </div>
          <div className="alert alert--info" style={{ marginTop: 0 }}>
            <span>ℹ️</span>
            <span>
              Codi resultant:{' '}
              {!magatzemFixe && magatzemSel && (
                <span className="text-mono" style={{ marginRight: 6 }}>
                  [{magatzemSel.nom || magatzemSel.codi_magatzem}]
                </span>
              )}
              <strong className="text-mono">
                {form.passadis || '???'}-{form.estant || '???'}-{form.alcada || '???'}
              </strong>
            </span>
          </div>
          {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel·lar</button>
            <button type="submit" className="btn-primary" disabled={saving || !magId}>
              {saving ? 'Creant...' : 'Crear ubicació'}
            </button>
          </div>
        </form>
      )}

      {/* ── Tab: Per passadís ── */}
      {tab === 'passadis' && (
        bulkResult !== null ? (
          <div className="modal-form">
            <div className="alert alert--info">
              <span>✅</span>
              <span>
                <strong>{bulkResult} ubicacions</strong> creades al passadís{' '}
                <span className="text-mono">{passUpper}</span>.
              </span>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setBulkResult(null); setPassadis(''); }}>
                Crear-ne més
              </button>
              <button className="btn-primary" onClick={onClose}>Tancar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleBulk} className="modal-form">
            {!magatzemFixe && (
              <Field label="Magatzem" required>
                <MagatzemAutocomplete
                  fetchOptions={fetchMagatzems}
                  value={magatzemSel}
                  onChange={setMagatzemSel}
                  placeholder="Selecciona un magatzem..."
                />
              </Field>
            )}

            <Field label="Passadís (exactament 3 car. alfanumèrics)" required>
              <input className="login-input" value={passadis} maxLength={3} placeholder="A01"
                onChange={e => setPassadis(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                required />
            </Field>

            <RangSection
              title="Estants"
              de={estDe}    onDe={v => setEstDe(v)}
              fins={estFins} onFins={v => setEstFins(v)}
              result={estRes} preview={preview}
            />

            <RangSection
              title="Alçades"
              de={alcDe}    onDe={v => setAlcDe(v)}
              fins={alcFins} onFins={v => setAlcFins(v)}
              result={alcRes} preview={preview}
            />

            {!estRes.error && !alcRes.error && totalBulk > 0 && (
              <div className="alert alert--info">
                <span>📦</span>
                <span>
                  Es crearan{' '}
                  <strong>{estRes.codis.length} × {alcRes.codis.length} = {totalBulk} ubicacions</strong>
                  {' '}al passadís <span className="text-mono">{passUpper || '???'}</span>.
                  {' '}Ex:{' '}
                  <span className="text-mono">
                    {passUpper || '???'}-{estRes.codis[0]}-{alcRes.codis[0]}
                  </span>
                </span>
              </div>
            )}

            {bulkError && <div className="login-error"><span>⚠️</span> {bulkError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={savingBulk || !canBulk}>
                {savingBulk ? 'Creant...' : canBulk ? `Crear ${totalBulk} ubicacions` : 'Crear ubicacions'}
              </button>
            </div>
          </form>
        )
      )}
    </Modal>
  );
}

function RangSection({ title, de, onDe, fins, onFins, result, preview }) {
  const alphaNum3 = v => v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
  return (
    <div style={{ background: '#f4f6f8', borderRadius: 8, padding: '12px 14px', marginBottom: 4 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem' }}>{title}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Des de (3 car.)">
          <input className="login-input text-mono" value={de} maxLength={3}
            style={{ width: 80 }}
            onChange={e => onDe(alphaNum3(e.target.value))} />
        </Field>
        <Field label="Fins a (3 car.)">
          <input className="login-input text-mono" value={fins} maxLength={3}
            style={{ width: 80 }}
            onChange={e => onFins(alphaNum3(e.target.value))} />
        </Field>
      </div>
      {result.error
        ? <div style={{ color: '#e74c3c', fontSize: '0.85rem', marginTop: 4 }}>⚠ {result.error}</div>
        : result.codis.length > 0 && (
            <div style={{ fontSize: '0.82rem', color: '#555', marginTop: 4 }}>
              Generarà: <span className="text-mono">{preview(result.codis)}</span>
            </div>
          )
      }
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 540 }}>
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

// ── Code generator ────────────────────────────────────────────────────────────
// Both `de` and `fins` are full 3-char alphanumeric codes.
// Finds the common prefix, then iterates the varying part (numeric or single letter).
//   "001" → "015"  prefix="0"  varies 01→15  → 001,002,…,015
//   "00A" → "00D"  prefix="00" varies A→D    → 00A,00B,00C,00D
//   "E01" → "E09"  prefix="E"  varies 01→09  → E01,E02,…,E09
//   "001" → "100"  prefix=""   varies 001→100 → 001,002,…,100

function generarCodisRang(de, fins) {
  const a = (de   || '').toUpperCase().trim();
  const b = (fins || '').toUpperCase().trim();

  if (!a || !b) return { codis: [], error: null };
  if (!/^[A-Z0-9]{3}$/.test(a)) return { codis: [], error: `"${a}" ha de tenir exactament 3 caràcters alfanumèrics.` };
  if (!/^[A-Z0-9]{3}$/.test(b)) return { codis: [], error: `"${b}" ha de tenir exactament 3 caràcters alfanumèrics.` };

  // Find common prefix (identical leading chars)
  let prefixLen = 0;
  while (prefixLen < 3 && a[prefixLen] === b[prefixLen]) prefixLen++;

  if (prefixLen === 3) return { codis: [a] }; // identical codes

  const prefix = a.slice(0, prefixLen);
  const varA   = a.slice(prefixLen);
  const varB   = b.slice(prefixLen);
  const varLen = varA.length; // === varB.length

  // Numeric range
  if (/^\d+$/.test(varA) && /^\d+$/.test(varB)) {
    const numA = parseInt(varA, 10), numB = parseInt(varB, 10);
    if (numA > numB) return { codis: [], error: '"Des de" ha de ser ≤ "Fins a".' };
    const codis = [];
    for (let i = numA; i <= numB; i++) codis.push(prefix + String(i).padStart(varLen, '0'));
    return { codis };
  }

  // Single-letter range
  if (/^[A-Z]$/.test(varA) && /^[A-Z]$/.test(varB)) {
    const cA = varA.charCodeAt(0), cB = varB.charCodeAt(0);
    if (cA > cB) return { codis: [], error: '"Des de" ha de ser ≤ "Fins a".' };
    const codis = [];
    for (let c = cA; c <= cB; c++) codis.push(prefix + String.fromCharCode(c));
    return { codis };
  }

  return { codis: [], error: `No es pot calcular el rang entre "${a}" i "${b}". La part variable ha de ser numèrica o una sola lletra.` };
}
