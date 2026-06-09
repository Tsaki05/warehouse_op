import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/AuthContext';
import { useFilter } from '../../../shared/contexts/FilterContext';
import { getComandes, createComanda, marcarPreparat, createFactura } from '../api/comandesApi';
import { getProductes, getLots, getMagatzems } from '../../inventari/api/inventariApi';
import { getClients, createClient } from '../../clients/api/clientsApi';
import { useDebounce } from '../../../shared/hooks/useDebounce';

const METODE_LABEL = { 1: 'Targeta', 2: 'Transferència', 3: 'Efectiu' };
const METODE_BADGE = { 1: 'blue',    2: 'green',          3: 'orange' };

const FILTRES_ENVIAMENT = [
  { key: 'true',  label: '🚚 Enviament' },
  { key: 'false', label: '🏪 Recollida' },
];

const FILTRES_FASE = [
  { key: 'per_preparar', label: '⏳ Per preparar' },
  { key: 'preparada',    label: '✅ Preparades' },
  { key: 'facturada',    label: '🧾 Facturades' },
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
  const navigate       = useNavigate();
  const isAdmin        = user?.rol === 'admin';
  const canCreate      = isAdmin || user?.rol === 'superior';
  const canInvoice     = isAdmin || user?.rol === 'superior';

  const [comandes, setComandes]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [expandida, setExpandida] = useState(null);

  const [cercaInput, setCercaInput] = useState('');
  const [enviaments, setEnviaments] = useState(new Set());
  const [fases, setFases]           = useState(new Set());
  const [ordre, setOrdre]           = useState('data_desc');
  const cerca                       = useDebounce(cercaInput, 350);

  // modals
  const [modalNova, setModalNova]         = useState(false);
  const [modalCsv, setModalCsv]           = useState(false);
  const [saving, setSaving]               = useState(false);
  const [formError, setFormError]         = useState('');
  // modal preparació (selecció de lots)
  const [preparacioComanda, setPreparacioComanda] = useState(null);
  // modal confirmació factura
  const [confirmFact, setConfirmFact]     = useState(null); // { comanda } | null
  const [confirmMetode, setConfirmMetode] = useState('');
  const [savingFact, setSavingFact]       = useState(false);
  const [factError, setFactError]         = useState('');

  // form nova comanda
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [paquets, setPaquets]         = useState([{ ...EMPTY_PAQUET }]);
  const [magatzemComanda, setMagatzemComanda] = useState(null); // { codi_magatzem, nom }

  const magIds    = useMemo(() => magFiltrat.map(m => m.codi_magatzem), [magFiltrat]);
  const magFilter = useMemo(() => magIds.length > 0 ? { magatzem_filter: magIds } : {}, [magIds]);

  // filtre de magatzem pel formulari: admin tria explícitament, la resta usa el filtre global
  const formMagFilter = useMemo(() => {
    if (!isAdmin) return magFilter;
    return magatzemComanda ? { magatzem_filter: [magatzemComanda.codi_magatzem] } : {};
  }, [isAdmin, magatzemComanda, magFilter]);

  const load = useCallback((params) => {
    setLoading(true);
    getComandes(params)
      .then(res => {
        setComandes(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError("No s'ha pogut carregar les comandes."))
      .finally(() => setLoading(false));
  }, []);

  function buildParams() {
    return {
      cerca:    cerca || undefined,
      ordre,
      ...magFilter,
      ...(enviaments.size === 1 ? { enviament: [...enviaments][0] } : {}),
      ...(fases.size > 0 ? { fase: [...fases] } : {}),
    };
  }

  useEffect(() => {
    load(buildParams());
    setExpandida(null);
  }, [load, cerca, enviaments, fases, ordre, magFiltrat]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openModalNova() {
    setForm({ ...EMPTY_FORM });
    setPaquets([{ ...EMPTY_PAQUET }]);
    setFormError('');
    if (isAdmin) {
      setMagatzemComanda(magFiltrat.length === 1 ? magFiltrat[0] : null);
    }
    setModalNova(true);
  }

  function handleMagatzemComandaChange(mag) {
    setMagatzemComanda(mag);
    setPaquets([{ ...EMPTY_PAQUET }]); // reset productes quan canvia el magatzem
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.clientObj) { setFormError('Cal seleccionar un client.'); return; }
    if (isAdmin && !magatzemComanda) { setFormError('Cal seleccionar un magatzem per a la comanda.'); return; }
    if (paquets.some(p => !p.producteObj)) { setFormError('Cal seleccionar producte per a cada línia.'); return; }

    const magComandaId = isAdmin
      ? magatzemComanda.codi_magatzem
      : (magFiltrat[0]?.codi_magatzem ?? undefined);

    const signe = form.tipus === 'retorn' ? -1 : 1;
    setSaving(true); setFormError('');
    try {
      let clientNif = form.clientObj.nif;

      // Si el client és nou (no desat encara), crear-lo primer en la mateixa transacció
      if (form.clientObj._isPending) {
        const { _isPending: _p, ...clientData } = form.clientObj; // eslint-disable-line no-unused-vars
        const clientRes = await createClient(clientData);
        clientNif = clientRes.data.nif;
      }

      await createComanda({
        client:          clientNif,
        metode_pagament: form.metode_pagament ? parseInt(form.metode_pagament) : null,
        enviament:       form.tipus === 'retorn' ? false : form.enviament,
        magatzem:        magComandaId,
        paquets: paquets.map(p => ({
          producte:  p.producteObj.id_producte,
          preu:      parseFloat(p.producteObj.preu),
          quantitat: signe * Math.abs(parseInt(p.quantitat) || 1),
        })),
      });
      load(buildParams());
      setModalNova(false);
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.nif?.[0] || d?.paquets?.[0] || d?.id_comanda?.[0] || d?.detail
        || (typeof d === 'object' ? JSON.stringify(d) : d)
        || 'Error en crear la comanda.';
      setFormError(msg);
    } finally { setSaving(false); }
  }

  // Compte quantes comandes preparades (sense factura) hi ha per client a la llista actual
  const preparedesPerClient = useMemo(() => {
    const m = {};
    for (const c of comandes) {
      if (c.preparat && !c.factura) m[c.client] = (m[c.client] || 0) + 1;
    }
    return m;
  }, [comandes]);

  function handlePreparacioFeta(updated) {
    setComandes(prev => prev.map(c => c.id_comanda === updated.id_comanda ? updated : c));
    setPreparacioComanda(null);
  }

  function openConfirmFactura(comanda) {
    setConfirmFact(comanda);
    setConfirmMetode(comanda.metode_pagament ? String(comanda.metode_pagament) : '');
    setFactError('');
  }

  async function handleConfirmFactura() {
    const needsMetode = !confirmFact.metode_pagament;
    if (needsMetode && !confirmMetode) { setFactError('Cal indicar el mètode de pagament.'); return; }
    setSavingFact(true); setFactError('');
    try {
      const payload = { comandes: [confirmFact.id_comanda] };
      if (needsMetode) payload.metode_pagament = parseInt(confirmMetode);
      await createFactura(payload);
      setConfirmFact(null);
      load(buildParams());
    } catch (err) {
      const d = err.response?.data;
      setFactError(d?.metode_pagament?.[0] || d?.comandes?.[0] || d?.detail || 'Error en crear la factura.');
    } finally { setSavingFact(false); }
  }

  function handleFacturaConjunta(clientNif, clientNom) {
    navigate('/factures', { state: { novaFactura: true, clientNif, clientNom } });
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
        <p className="page-subtitle">Gestió del cicle de vida de les comandes.</p>
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
              className={`filter-btn${enviaments.has(f.key) ? ' filter-btn--active' : ''}`}
              onClick={() => {
                setEnviaments(prev => { const n = new Set(prev); n.has(f.key) ? n.delete(f.key) : n.add(f.key); return n; });
                setExpandida(null);
              }}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="filter-bar" style={{ margin: 0 }}>
          {FILTRES_FASE.map(f => (
            <button key={f.key}
              className={`filter-btn${fases.has(f.key) ? ' filter-btn--active' : ''}`}
              onClick={() => {
                setFases(prev => { const n = new Set(prev); n.has(f.key) ? n.delete(f.key) : n.add(f.key); return n; });
                setExpandida(null);
              }}>
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
          {total.toLocaleString()} comandes
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
          {comandes.map(c => {
            const nOthersPrepared = (preparedesPerClient[c.client] || 0) - 1;
            return (
            <div key={c.id_comanda} className="comanda-card">
              {/* Capçalera — clic per expandir */}
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
                    : <span className="badge badge--gray">⏳ Pendent</span>
                  }
                  <span className="comanda-amount">{parseFloat(c.import_total).toFixed(2)} €</span>
                  <span style={{ color: '#aab4be', fontSize: '0.85rem' }}>
                    {expandida === c.id_comanda ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* Barra d'accions — fora del clic d'expansió */}
              <div style={{
                padding: '10px 18px', borderTop: '1px solid #f0f2f5',
                background: '#f8f9fb', display: 'flex', gap: 10,
                justifyContent: 'flex-end', alignItems: 'center',
              }}>
                {c.factura ? (
                  <span style={{ color: '#aab4be', fontSize: '0.85rem' }}>
                    🧾 Factura: <span className="text-mono" style={{ color: '#5d6d7e', fontWeight: 600 }}>{c.factura}</span>
                  </span>
                ) : c.preparat ? (
                  canInvoice ? (
                    <>
                      {nOthersPrepared > 0 && (
                        <button className="btn-secondary"
                          onClick={() => handleFacturaConjunta(c.client, c.client_nom)}>
                          📋 Factura conjunta ({nOthersPrepared + 1} comandes)
                        </button>
                      )}
                      <button className="btn-primary"
                        onClick={() => openConfirmFactura(c)}>
                        🧾 Facturar
                      </button>
                    </>
                  ) : (
                    <span style={{ color: '#aab4be', fontSize: '0.85rem' }}>Preparada — pendent de facturar</span>
                  )
                ) : (
                  <button
                    className="btn-primary"
                    style={{ background: '#27ae60', borderColor: '#27ae60' }}
                    onClick={() => setPreparacioComanda(c)}>
                    ✓ Marcar com a preparada
                  </button>
                )}
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
          );
          })}
        </div>
      )}

      {/* ── Modal confirmació factura ── */}
      {confirmFact && (
        <Modal title="Confirmar facturació" onClose={() => setConfirmFact(null)}>
          <div className="modal-form">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.9rem', color: '#5d6d7e', marginBottom: 4 }}>Client</div>
              <strong>{confirmFact.client_nom}</strong>
              <span className="text-mono" style={{ marginLeft: 8, opacity: 0.55, fontSize: '0.85rem' }}>{confirmFact.client}</span>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.9rem', color: '#5d6d7e', marginBottom: 4 }}>Comanda</div>
              <span className="text-mono" style={{ fontWeight: 700 }}>{confirmFact.id_comanda}</span>
              <span style={{ marginLeft: 12, fontWeight: 700, color: '#2c3e50' }}>
                {parseFloat(confirmFact.import_total).toFixed(2)} €
              </span>
            </div>
            <div className="login-field">
              <label className="login-label">
                Mètode de pagament {!confirmFact.metode_pagament && <span style={{ color: '#e74c3c' }}>*</span>}
              </label>
              {confirmFact.metode_pagament ? (
                <div style={{ padding: '8px 0', fontWeight: 600 }}>
                  {METODE_LABEL[confirmFact.metode_pagament]}
                </div>
              ) : (
                <select className="login-input" value={confirmMetode}
                  onChange={e => setConfirmMetode(e.target.value)}>
                  <option value="">— Selecciona un mètode —</option>
                  <option value="1">💳 Targeta</option>
                  <option value="2">🏦 Transferència</option>
                  <option value="3">💵 Efectiu</option>
                </select>
              )}
            </div>
            {factError && <div className="login-error"><span>⚠️</span> {factError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfirmFact(null)}>Cancel·lar</button>
              <button type="button" className="btn-primary" disabled={savingFact} onClick={handleConfirmFactura}>
                {savingFact ? 'Creant...' : '🧾 Confirmar factura'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal preparació (selecció de lots) ── */}
      {preparacioComanda && (
        <PreparacioModal
          comanda={preparacioComanda}
          magFiltrat={magFiltrat}
          onClose={() => setPreparacioComanda(null)}
          onDone={handlePreparacioFeta}
        />
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

            {isAdmin && (
              <Field label="Magatzem" required>
                <MagatzemComandaAutocomplete
                  value={magatzemComanda}
                  onChange={handleMagatzemComandaChange}
                />
                {!magatzemComanda && (
                  <div style={{ fontSize: '0.78rem', color: '#7f8c8d', marginTop: 4 }}>
                    Cal seleccionar un magatzem abans d'escollir productes.
                  </div>
                )}
              </Field>
            )}

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
                      magFilter={formMagFilter}
                      disabled={isAdmin && !magatzemComanda}
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
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [options, setOptions]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [modalNou, setModalNou]   = useState(false);
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

  return (
    <>
      <div className="mag-auto" ref={ref}>
        <div className="mag-auto-wrap">
          <input className="mag-auto-input"
            placeholder={value ? `${value.nom} · ${value.nif}` : placeholder}
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
              : options.length === 0
                ? <div className="mag-auto-empty">Cap client trobat</div>
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
      <button type="button"
        style={{ marginTop: 6, fontSize: '0.82rem', color: '#2980b9', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        onMouseDown={e => { e.preventDefault(); setOpen(false); setModalNou(true); }}>
        + Crear client nou
      </button>
      {modalNou && (
        <ClientCreateModal
          onClose={() => setModalNou(false)}
          onCreated={client => { onChange(client); setModalNou(false); }}
        />
      )}
    </>
  );
}

// ── ClientCreateModal ─────────────────────────────────────────────────────────
// No usa <form> per evitar imbricació amb el formulari exterior de "Nova comanda".
// No crida l'API: desa el client en memòria amb _isPending:true i s'envia
// junt amb la comanda quan l'usuari confirmi el formulari principal.
const EMPTY_CLIENT_FORM = { nif: '', nom: '', correu_electronic: '', tipus: 'individual', telefon: '', adressa: '', enviament: false };

function ClientCreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ ...EMPTY_CLIENT_FORM });
  const [error, setError] = useState('');

  function handleAfegir() {
    if (!form.nif.trim() || form.nif.trim().length !== 9) {
      setError('El NIF ha de tenir exactament 9 caràcters.'); return;
    }
    if (!form.nom.trim()) { setError('Cal indicar el nom.'); return; }
    if (!form.correu_electronic.trim()) { setError('Cal indicar el correu electrònic.'); return; }
    if (form.tipus === 'individual' && !form.telefon.trim()) {
      setError('Cal indicar el telèfon.'); return;
    }
    if (form.tipus === 'empresa' && !form.adressa.trim()) {
      setError("Cal indicar l'adreça."); return;
    }
    // El client es desa en memòria; l'API es cridarà quan es creï la comanda
    onCreated({ ...form, nif: form.nif.trim().toUpperCase(), _isPending: true });
  }

  const f = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  return (
    <Modal title="Nou client" onClose={onClose}>
      <div className="modal-form">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[{ key: 'individual', label: '👤 Particular' }, { key: 'empresa', label: '🏢 Empresa' }].map(t => (
            <button key={t.key} type="button"
              onClick={() => f('tipus', t.key)}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, border: '2px solid',
                borderColor: form.tipus === t.key ? '#3498db' : '#e0e6ed',
                background: form.tipus === t.key ? '#ebf5fb' : '#fff',
                cursor: 'pointer', fontWeight: 600,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <Field label="NIF / DNI" required>
          <input className="login-input" value={form.nif}
            onChange={e => f('nif', e.target.value.toUpperCase())}
            placeholder="Ex: 12345678A" maxLength={9} />
        </Field>
        <Field label="Nom" required>
          <input className="login-input" value={form.nom}
            onChange={e => f('nom', e.target.value)} />
        </Field>
        <Field label="Correu electrònic" required>
          <input className="login-input" type="email" value={form.correu_electronic}
            onChange={e => f('correu_electronic', e.target.value)} />
        </Field>

        {form.tipus === 'individual' ? (
          <Field label="Telèfon" required>
            <input className="login-input" type="tel" value={form.telefon}
              onChange={e => f('telefon', e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label="Adreça" required>
              <input className="login-input" value={form.adressa}
                onChange={e => f('adressa', e.target.value)} />
            </Field>
            <Field label="">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.enviament}
                  onChange={e => f('enviament', e.target.checked)} />
                <span>🚚 Admet enviament a domicili</span>
              </label>
            </Field>
          </>
        )}

        {error && <div className="login-error"><span>⚠️</span> {error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel·lar</button>
          <button type="button" className="btn-primary" onClick={handleAfegir}>
            Afegir al formulari
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── MagatzemComandaAutocomplete ───────────────────────────────────────────────
function MagatzemComandaAutocomplete({ value, onChange, placeholder = 'Cercar magatzem...' }) {
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
    getMagatzems({ cerca: queryDb || undefined })
      .then(res => setOptions(res.data.results ?? res.data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [queryDb, open]);

  return (
    <div className="mag-auto" ref={ref}>
      <div className="mag-auto-wrap">
        <input
          className="mag-auto-input"
          placeholder={value ? `${value.nom} (${value.codi_magatzem})` : placeholder}
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
          {loading
            ? <div className="mag-auto-empty">Carregant...</div>
            : options.length === 0
              ? <div className="mag-auto-empty">Cap magatzem trobat</div>
              : options.map(m => (
                <div key={m.codi_magatzem} className="mag-auto-opt"
                  onMouseDown={() => { onChange(m); setQuery(''); setOpen(false); }}>
                  <span className="mag-auto-opt-nom">{m.nom}</span>
                  <span className="mag-auto-opt-cod text-mono">{m.codi_magatzem}</span>
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── ProducteAutocomplete ──────────────────────────────────────────────────────
function ProducteAutocomplete({ value, onChange, magFilter = {}, disabled = false, placeholder = 'Cercar producte...' }) {
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
    getProductes({ cerca: queryDb || undefined, ...magFilter })
      .then(res => setOptions(res.data.results ?? res.data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [queryDb, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayText = value ? value.nom : '';

  return (
    <div className="mag-auto" ref={ref}>
      <div className="mag-auto-wrap">
        <input className="mag-auto-input"
          placeholder={disabled ? 'Selecciona primer un magatzem' : (displayText || placeholder)}
          value={query}
          disabled={disabled}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} />
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

// ── PreparacioModal ───────────────────────────────────────────────────────────
function PreparacioModal({ comanda, magFiltrat, onClose, onDone }) {
  // Prioritzem el magatzem de la comanda; si no en té, usem el filtre global
  const magIds = comanda.magatzem
    ? [comanda.magatzem]
    : magFiltrat.map(m => m.codi_magatzem);

  const paquetsPositius  = comanda.paquets.filter(p => p.quantitat > 0);
  const paquetsNegatitus = comanda.paquets.filter(p => p.quantitat < 0);
  const esRetorn         = paquetsPositius.length === 0 && paquetsNegatitus.length > 0;
  const paquetsActius    = esRetorn ? paquetsNegatitus : paquetsPositius;

  const [lotsPerIndex, setLotsPerIndex] = useState({});
  const [lotSeleccio, setLotSeleccio]   = useState({});
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    if (paquetsActius.length === 0) { setLoading(false); return; }
    Promise.all(
      paquetsActius.map((p, i) =>
        getLots({ producte: p.producte, ...(magIds.length > 0 ? { magatzem_filter: magIds } : {}) })
          .then(res => {
            const tots = res.data.results ?? res.data;
            // Compres: cal estoc > 0. Retorns: qualsevol lot del magatzem (per reposar)
            const lots = esRetorn ? tots : tots.filter(l => l.quantitat > 0);
            return { i, lots };
          })
      )
    ).then(results => {
      const lpi = {};
      const ls  = {};
      for (const { i, lots } of results) {
        lpi[i] = lots;
        if (lots.length === 1) ls[i] = String(lots[0].id);
      }
      setLotsPerIndex(lpi);
      setLotSeleccio(ls);
      setLoading(false);
    }).catch(() => { setError("No s'han pogut carregar els lots."); setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm() {
    for (let i = 0; i < paquetsActius.length; i++) {
      if (!lotSeleccio[i]) { setError('Cal seleccionar un lot per a cada producte.'); return; }
      const lot = (lotsPerIndex[i] || []).find(l => String(l.id) === lotSeleccio[i]);
      if (!esRetorn && lot && lot.quantitat < Math.abs(paquetsActius[i].quantitat)) {
        setError(`Estoc insuficient per a "${paquetsActius[i].producte_nom}": ${lot.quantitat} disponibles, ${Math.abs(paquetsActius[i].quantitat)} necessaris.`);
        return;
      }
    }
    const lotsPayload = paquetsActius.map((p, i) => ({
      lot:      parseInt(lotSeleccio[i]),
      quantitat: Math.abs(p.quantitat), // sempre positiu; el servei sap si és retorn
    }));
    setSaving(true); setError('');
    try {
      const res = await marcarPreparat(comanda.id_comanda, { lots: lotsPayload });
      onDone(res.data);
    } catch (err) {
      const d = err.response?.data;
      setError(d?.detail || d?.lots?.[0] || 'Error en marcar com a preparada.');
    } finally { setSaving(false); }
  }

  return (
    <Modal title={esRetorn ? 'Processar retorn' : 'Preparar comanda'} onClose={onClose}>
      <div className="modal-form">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.9rem', color: '#5d6d7e', marginBottom: 4 }}>Comanda</div>
          <span className="text-mono" style={{ fontWeight: 700 }}>{comanda.id_comanda}</span>
          <span style={{ marginLeft: 12, color: '#5d6d7e' }}>{comanda.client_nom}</span>
          {esRetorn && (
            <span className="badge badge--orange" style={{ marginLeft: 10 }}>🔄 Retorn</span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#aab4be' }}>Carregant lots...</div>
        ) : paquetsActius.length === 0 ? (
          <div className="alert alert--info"><span>ℹ️</span><span>Sense productes a processar.</span></div>
        ) : (
          <div>
            <div style={{ marginBottom: 12, fontSize: '0.88rem', color: '#5d6d7e' }}>
              {esRetorn
                ? 'Indica a quin lot es reintegra cada producte retornat:'
                : 'Indica de quin lot s\'ha agafat cada producte:'}
            </div>
            {paquetsActius.map((p, i) => {
              const lots   = lotsPerIndex[i] || [];
              const selId  = lotSeleccio[i] || '';
              const selLot = lots.find(l => String(l.id) === selId);
              const enough = selLot ? selLot.quantitat >= p.quantitat : true;
              return (
                <div key={i} style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>{p.producte_nom}</strong>
                      <span className="text-mono" style={{ marginLeft: 8, opacity: 0.5, fontSize: '0.78rem' }}>{p.producte}</span>
                    </div>
                    <span className="badge badge--blue">{p.quantitat} u.</span>
                  </div>
                  {lots.length === 0 ? (
                    <div style={{ color: '#e74c3c', fontSize: '0.85rem' }}>⚠️ No hi ha lots disponibles amb estoc.</div>
                  ) : (
                    <>
                      <select className="login-input" value={selId}
                        onChange={e => setLotSeleccio(prev => ({ ...prev, [i]: e.target.value }))}>
                        <option value="">— Selecciona un lot —</option>
                        {lots.map(l => (
                          <option key={l.id} value={String(l.id)}>
                            {l.ubicacio_codi} · {l.quantitat} u. disponibles{l.data_entrada ? ` · Entrada: ${l.data_entrada}` : ''}
                          </option>
                        ))}
                      </select>
                      {selLot && (
                        <div style={{ marginTop: 4, fontSize: '0.82rem', color: enough ? '#27ae60' : '#e74c3c' }}>
                          {enough
                            ? `✓ Estoc disponible: ${selLot.quantitat} u.`
                            : `⚠️ Estoc insuficient: ${selLot.quantitat} disponibles, ${p.quantitat} necessaris.`}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <div className="login-error"><span>⚠️</span> {error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel·lar</button>
          <button type="button" className="btn-primary"
            style={{ background: esRetorn ? '#e67e22' : '#27ae60', borderColor: esRetorn ? '#e67e22' : '#27ae60' }}
            disabled={saving || loading} onClick={handleConfirm}>
            {saving ? (esRetorn ? 'Processant...' : 'Preparant...') : (esRetorn ? '🔄 Confirmar retorn' : '✓ Confirmar preparació')}
          </button>
        </div>
      </div>
    </Modal>
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
