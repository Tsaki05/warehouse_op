import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFilter } from '../contexts/FilterContext';
import { getMagatzems, getUbicacions, createUbicacio, deleteUbicacio } from '../api/api';
import { useDebounce } from '../hooks/useDebounce';
import MagatzemAutocomplete from '../components/MagatzemAutocomplete';

const EMPTY_FORM = { passadis: '', estant: '', alcada: '' };

export default function MagatzemsUbicacions() {
  const { user } = useAuth();
  const { magFiltrat } = useFilter();
  const canEdit = user?.rol === 'admin' || user?.rol === 'superior';

  if (magFiltrat.length === 0) {
    return <AllUbicacionsPanel canEdit={canEdit} />;
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">🏢 Magatzems i Ubicacions</h1>
        <p className="page-subtitle">Gestió d'ubicacions per magatzem.</p>
      </div>
      {magFiltrat.map(mag => (
        <div key={mag.codi_magatzem} style={{ marginBottom: 32 }}>
          <div className="section-card" style={{ marginBottom: 12 }}>
            <div className="section-card-header">
              <span className="section-card-title">🏢 {mag.nom || 'Magatzem'}</span>
              <span className="section-card-count text-mono">{mag.codi_magatzem}</span>
            </div>
          </div>
          <UbicacionsPanel magatzemId={mag.codi_magatzem} canEdit={canEdit} />
        </div>
      ))}
    </div>
  );
}

function AllUbicacionsPanel({ canEdit }) {
  const [ubicacions, setUbicacions]   = useState([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [cerca, setCerca]             = useState('');
  const cercaDb                       = useDebounce(cerca, 350);

  const [modal, setModal]             = useState(false);
  const [modalDel, setModalDel]       = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [magatzemSel, setMagatzemSel] = useState(null);
  const [magatzemsOpts, setMagatzemsOpts] = useState([]);
  const [loadingMags, setLoadingMags] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');

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

  function openModal() {
    setForm(EMPTY_FORM);
    setMagatzemSel(null);
    setFormError('');
    setModal(true);
    if (magatzemsOpts.length === 0) {
      setLoadingMags(true);
      getMagatzems()
        .then(res => setMagatzemsOpts(res.data.results ?? res.data))
        .finally(() => setLoadingMags(false));
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!magatzemSel) { setFormError('Has de seleccionar un magatzem.'); return; }
    setSaving(true); setFormError('');
    try {
      await createUbicacio({ ...form, magatzem: magatzemSel.codi_magatzem });
      load();
      setModal(false);
      setForm(EMPTY_FORM);
      setMagatzemSel(null);
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.passadis?.[0] || d?.estant?.[0] || d?.alcada?.[0] || d?.detail
        || d?.non_field_errors?.[0] || JSON.stringify(d) || 'Error en crear la ubicació.';
      setFormError(msg);
    } finally { setSaving(false); }
  }

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
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">🏢 Magatzems i Ubicacions</h1>
        <p className="page-subtitle">Gestió d'ubicacions per magatzem.</p>
      </div>

      <div className="search-controls">
        <div className="search-bar" style={{ flex: 1 }}>
          <input className="search-input"
            placeholder="Cercar per passadís, estant o alçada..."
            value={cerca} onChange={e => setCerca(e.target.value)} />
          {cerca && <button type="button" className="search-clear" onClick={() => setCerca('')}>✕</button>}
          {loading && cerca && <span style={{ padding: '0 12px', color: '#aab4be', fontSize: '0.85rem' }}>⟳</span>}
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openModal}>+ Nova ubicació</button>
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

      {modal && (
        <Modal title="Nova ubicació" onClose={() => setModal(false)}>
          <form onSubmit={handleCreate} className="modal-form">
            <Field label="Magatzem" required>
              {loadingMags
                ? <div style={{ color: '#aab4be', fontSize: '0.9rem' }}>Carregant magatzems...</div>
                : <MagatzemAutocomplete
                    magatzems={magatzemsOpts}
                    value={magatzemSel}
                    onChange={setMagatzemSel}
                    placeholder="Selecciona un magatzem..."
                  />
              }
            </Field>
            <p style={{ color: '#7f8c8d', fontSize: '0.95rem', marginTop: 8 }}>
              Cada camp ha de tenir exactament <strong>3 caràcters alfanumèrics</strong>.
            </p>
            <div className="form-row form-row--2" style={{ gap: 12 }}>
              <Field label="Passadís (3 car.)" required>
                <input className="login-input" value={form.passadis} maxLength={3}
                  placeholder="A1B" onChange={e => setForm(f => ({ ...f, passadis: e.target.value.toUpperCase() }))} required />
              </Field>
              <Field label="Estant (3 car.)" required>
                <input className="login-input" value={form.estant} maxLength={3}
                  placeholder="C2D" onChange={e => setForm(f => ({ ...f, estant: e.target.value.toUpperCase() }))} required />
              </Field>
              <Field label="Alçada (3 car.)" required>
                <input className="login-input" value={form.alcada} maxLength={3}
                  placeholder="E3F" onChange={e => setForm(f => ({ ...f, alcada: e.target.value.toUpperCase() }))} required />
              </Field>
            </div>
            <div className="alert alert--info" style={{ marginTop: 0 }}>
              <span>ℹ️</span>
              <span>
                Codi resultant:{' '}
                {magatzemSel && (
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
              <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={saving || !magatzemSel}>
                {saving ? 'Creant...' : 'Crear ubicació'}
              </button>
            </div>
          </form>
        </Modal>
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
  const [ubicacions, setUbicacions]   = useState([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [cerca, setCerca]             = useState('');
  const cercaDb                       = useDebounce(cerca, 350);

  const [modal, setModal]             = useState(false);
  const [modalDel, setModalDel]       = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');

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

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await createUbicacio({ ...form, magatzem: magatzemId });
      load();
      setModal(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.passadis?.[0] || d?.estant?.[0] || d?.alcada?.[0] || d?.detail
        || d?.non_field_errors?.[0] || JSON.stringify(d) || 'Error en crear la ubicació.';
      setFormError(msg);
    } finally { setSaving(false); }
  }

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
          <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModal(true); }}>
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

      {modal && (
        <Modal title="Nova ubicació" onClose={() => setModal(false)}>
          <form onSubmit={handleCreate} className="modal-form">
            <p style={{ color: '#7f8c8d', fontSize: '0.95rem' }}>
              Cada camp ha de tenir exactament <strong>3 caràcters alfanumèrics</strong>.
            </p>
            <div className="form-row form-row--2" style={{ gap: 12 }}>
              <Field label="Passadís (3 car.)" required>
                <input className="login-input" value={form.passadis} maxLength={3}
                  placeholder="A1B" onChange={e => setForm(f => ({ ...f, passadis: e.target.value.toUpperCase() }))} required />
              </Field>
              <Field label="Estant (3 car.)" required>
                <input className="login-input" value={form.estant} maxLength={3}
                  placeholder="C2D" onChange={e => setForm(f => ({ ...f, estant: e.target.value.toUpperCase() }))} required />
              </Field>
              <Field label="Alçada (3 car.)" required>
                <input className="login-input" value={form.alcada} maxLength={3}
                  placeholder="E3F" onChange={e => setForm(f => ({ ...f, alcada: e.target.value.toUpperCase() }))} required />
              </Field>
            </div>
            <div className="alert alert--info" style={{ marginTop: 0 }}>
              <span>ℹ️</span>
              <span>Codi resultant: <strong className="text-mono">
                {form.passadis || '???'}-{form.estant || '???'}-{form.alcada || '???'}
              </strong></span>
            </div>
            {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Creant...' : 'Crear ubicació'}
              </button>
            </div>
          </form>
        </Modal>
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

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
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
