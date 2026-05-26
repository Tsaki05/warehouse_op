import { useState, useEffect } from 'react';
import { getMagatzems, getProductes } from '../api/api';

const CATEGORIES = ['petit', 'mitja', 'gran', 'gegant'];

export default function EstocMagatzems() {
  const [tab, setTab] = useState('magatzems');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🏢 Estoc i Magatzems</h1>
        <p className="page-subtitle">Consulta d'inventari, ubicacions i productes.</p>
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'magatzems' ? ' tab--active' : ''}`} onClick={() => setTab('magatzems')}>
          Magatzems
        </button>
        <button className={`tab${tab === 'productes' ? ' tab--active' : ''}`} onClick={() => setTab('productes')}>
          Productes
        </button>
      </div>

      {tab === 'magatzems' ? <MagatzemsTab /> : <ProductesTab />}
    </div>
  );
}

function MagatzemsTab() {
  const [magatzems, setMagatzems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMagatzems()
      .then(res => {
        setMagatzems(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
        setLoading(false);
      })
      .catch(() => { setError('No s\'ha pogut carregar els magatzems.'); setLoading(false); });
  }, []);

  if (loading) return <StateBox>Carregant magatzems...</StateBox>;
  if (error)   return <StateBox error>{error}</StateBox>;

  return (
    <>
      <p className="result-count">Mostrant {magatzems.length} de {total} magatzems</p>
      <div className="card-grid">
        {magatzems.map(m => (
          <div key={m.codi_magatzem} className="card">
            <div className="card-code">{m.codi_magatzem}</div>
            <div className="card-title">{m.nom || <span className="text-muted">Sense nom</span>}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function ProductesTab() {
  const [productes, setProductes] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoria, setCategoria] = useState('');

  useEffect(() => {
    setLoading(true);
    getProductes(categoria)
      .then(res => {
        setProductes(res.data.results ?? res.data);
        setTotal(res.data.count ?? (res.data.results ?? res.data).length);
        setLoading(false);
      })
      .catch(() => { setError('No s\'ha pogut carregar els productes.'); setLoading(false); });
  }, [categoria]);

  if (error) return <StateBox error>{error}</StateBox>;

  return (
    <>
      <div className="filter-bar">
        <button className={`filter-btn${categoria === '' ? ' filter-btn--active' : ''}`} onClick={() => setCategoria('')}>Tots</button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            className={`filter-btn${categoria === c ? ' filter-btn--active' : ''}`}
            onClick={() => setCategoria(c)}
          >
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <StateBox>Carregant productes...</StateBox> : (
        <>
          <p className="result-count">Mostrant {productes.length} de {total} productes</p>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>ID Producte</th>
                  <th>Categoria</th>
                  <th>Preu</th>
                  <th>Estoc</th>
                </tr>
              </thead>
              <tbody>
                {productes.map(p => (
                  <tr key={p.id_producte}>
                    <td>{p.nom || <span className="text-muted">—</span>}</td>
                    <td className="text-mono">{p.id_producte}</td>
                    <td><span className={`badge badge--${p.categoria}`}>{p.categoria}</span></td>
                    <td>{parseFloat(p.preu).toFixed(2)} €</td>
                    <td>{p.estoc_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function StateBox({ children, error }) {
  return <div className={`state-box${error ? ' state-box--error' : ''}`}>{children}</div>;
}
