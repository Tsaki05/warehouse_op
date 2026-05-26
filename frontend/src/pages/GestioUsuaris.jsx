import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUsuaris, getMagatzems, createUsuari, updateUsuari, deleteUsuari, canviarPassword } from '../api/api';
import PasswordInput from '../components/PasswordInput';
import MagatzemAutocomplete from '../components/MagatzemAutocomplete';

const ROL_LABEL  = { admin: 'Admin', superior: 'Superior', mosso: 'Mosso' };
const ROL_BADGE  = { admin: 'purple', superior: 'blue', mosso: 'green' };
const ROL_OPTIONS_ADMIN    = ['admin', 'superior', 'mosso'];
const ROL_OPTIONS_SUPERIOR = ['mosso'];

const EMPTY_FORM = { username: '', first_name: '', last_name: '', password: '', rol: 'mosso', magatzem: '' };

export default function GestioUsuaris() {
  const { user: me }          = useAuth();
  const isAdmin               = me?.rol === 'admin';

  const [usuaris, setUsuaris]         = useState([]);
  const [magatzems, setMagatzems]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  // modal state
  const [modal, setModal]         = useState(null); // 'create' | 'edit' | 'password' | 'delete'
  const [selected, setSelected]   = useState(null); // user being edited/deleted
  const [form, setForm]           = useState(EMPTY_FORM);
  const [pwdForm, setPwdForm]     = useState({ password: '', confirm: '' });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    Promise.all([getUsuaris(), isAdmin ? getMagatzems() : Promise.resolve({ data: { results: [] } })])
      .then(([u, m]) => {
        setUsuaris(u.data);
        setMagatzems(m.data.results ?? m.data);
        setLoading(false);
      })
      .catch(() => { setError('No s\'ha pogut carregar la llista d\'usuaris.'); setLoading(false); });
  }, [isAdmin]);

  function reload() {
    getUsuaris().then(r => setUsuaris(r.data));
  }

  // ── open modals ────────────────────────────────────────────────────────────
  function openCreate() {
    setForm({ ...EMPTY_FORM, magatzem: isAdmin ? '' : (me.magatzem ?? '') });
    setFormError('');
    setModal('create');
  }
  function openEdit(u) {
    setSelected(u);
    setForm({
      username:   u.username,
      first_name: u.first_name,
      last_name:  u.last_name,
      password:   '',
      rol:        u.rol,
      magatzem:   u.magatzem ?? '',
    });
    setFormError('');
    setModal('edit');
  }
  function openPassword(u) {
    setSelected(u);
    setPwdForm({ password: '', confirm: '' });
    setFormError('');
    setModal('password');
  }
  function openDelete(u) {
    setSelected(u);
    setModal('delete');
  }
  function closeModal() { setModal(null); setSelected(null); setFormError(''); }

  // ── submit handlers ────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await createUsuari({
        username:   form.username,
        password:   form.password,
        first_name: form.first_name,
        last_name:  form.last_name,
        rol:        form.rol,
        magatzem:   form.magatzem || null,
      });
      reload(); closeModal();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Error en crear l\'usuari.');
    } finally { setSaving(false); }
  }

  async function handleEdit(e) {
    e.preventDefault();
    setSaving(true); setFormError('');
    const payload = {
      username:   form.username,
      first_name: form.first_name,
      last_name:  form.last_name,
    };
    if (isAdmin) { payload.rol = form.rol; payload.magatzem = form.magatzem || null; }
    try {
      await updateUsuari(selected.id, payload);
      reload(); closeModal();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Error en actualitzar l\'usuari.');
    } finally { setSaving(false); }
  }

  async function handlePassword(e) {
    e.preventDefault();
    if (pwdForm.password !== pwdForm.confirm) {
      setFormError('Les contrasenyes no coincideixen.'); return;
    }
    setSaving(true); setFormError('');
    try {
      await canviarPassword(selected.id, pwdForm.password);
      closeModal();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Error en canviar la contrasenya.');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteUsuari(selected.id);
      reload(); closeModal();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Error en eliminar l\'usuari.');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="state-box">Carregant usuaris...</div>;
  if (error)   return <div className="state-box state-box--error">{error}</div>;

  const rolOptions = isAdmin ? ROL_OPTIONS_ADMIN : ROL_OPTIONS_SUPERIOR;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">👥 Gestió d'Usuaris</h1>
        <p className="page-subtitle">
          {isAdmin
            ? 'Gestiona tots els usuaris del sistema.'
            : `Gestiona els mossos del teu magatzem (${me.magatzem_nom ?? ''}).`}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className="btn-primary" onClick={openCreate}>+ Nou usuari</button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Usuari</th>
              <th>Nom complet</th>
              <th>Rol</th>
              {isAdmin && <th>Magatzem</th>}
              <th>Accions</th>
            </tr>
          </thead>
          <tbody>
            {usuaris.length === 0 ? (
              <tr><td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', color: '#aab4be' }}>
                Cap usuari trobat.
              </td></tr>
            ) : usuaris.map(u => (
              <tr key={u.id}>
                <td className="text-mono">{u.username}</td>
                <td>{u.first_name} {u.last_name}</td>
                <td>
                  <span className={`badge badge--${ROL_BADGE[u.rol] || 'gray'}`}>
                    {ROL_LABEL[u.rol] || u.rol}
                  </span>
                </td>
                {isAdmin && <td>{u.magatzem_nom ?? <span className="text-muted">—</span>}</td>}
                <td>
                  <div className="action-btns">
                    <button className="btn-sm btn-sm--edit" onClick={() => openEdit(u)}>Editar</button>
                    <button className="btn-sm btn-sm--pwd"  onClick={() => openPassword(u)}>Contrasenya</button>
                    {u.id !== me.id && (
                      <button className="btn-sm btn-sm--del" onClick={() => openDelete(u)}>Eliminar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modals ── */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'Nou usuari' : `Editar: ${selected?.username}`} onClose={closeModal}>
          <form onSubmit={modal === 'create' ? handleCreate : handleEdit} className="modal-form">
            <div className="form-row">
              <Field label="Nom d'usuari" required>
                <input className="login-input" value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
              </Field>
            </div>
            <div className="form-row form-row--2">
              <Field label="Nom">
                <input className="login-input" value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              </Field>
              <Field label="Cognoms">
                <input className="login-input" value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </Field>
            </div>
            {modal === 'create' && (
              <Field label="Contrasenya (mínim 8 caràcters)" required>
                <PasswordInput value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
              </Field>
            )}
            <div className="form-row form-row--2">
              <Field label="Rol">
                <select className="login-input" value={form.rol}
                  onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
                  disabled={!isAdmin}>
                  {rolOptions.map(r => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                </select>
              </Field>
              {isAdmin && (
                <Field label="Magatzem">
                  <MagatzemAutocomplete
                    magatzems={magatzems}
                    value={form.magatzem ? (magatzems.find(m => m.codi_magatzem === form.magatzem) ?? null) : null}
                    onChange={m => setForm(f => ({ ...f, magatzem: m?.codi_magatzem || '' }))}
                    placeholder="— Sense magatzem —"
                  />
                </Field>
              )}
            </div>
            {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closeModal}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardant...' : (modal === 'create' ? 'Crear usuari' : 'Guardar canvis')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'password' && (
        <Modal title={`Canviar contrasenya: ${selected?.username}`} onClose={closeModal}>
          <form onSubmit={handlePassword} className="modal-form">
            <Field label="Nova contrasenya (mínim 8 caràcters)" required>
              <PasswordInput value={pwdForm.password}
                onChange={e => setPwdForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
            </Field>
            <Field label="Confirma la contrasenya" required>
              <PasswordInput value={pwdForm.confirm}
                onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))} required />
            </Field>
            {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closeModal}>Cancel·lar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardant...' : 'Canviar contrasenya'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal title="Eliminar usuari" onClose={closeModal}>
          <div className="modal-form">
            <p style={{ marginBottom: 20, fontSize: '1rem' }}>
              Segur que vols eliminar l'usuari <strong>{selected?.username}</strong>?
              Aquesta acció no es pot desfer.
            </p>
            {formError && <div className="login-error"><span>⚠️</span> {formError}</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeModal}>Cancel·lar</button>
              <button className="btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? 'Eliminant...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
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
