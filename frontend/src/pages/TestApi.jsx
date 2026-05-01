import { useState, useEffect } from 'react';
import { getMagatzems } from '../api/api';

const TestApi = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMagatzems()
      .then(res => {
        // DEBUG: Això t'ajudarà a veure la forma de la dada al terminal (F12)
        console.log("Resposta de l'API:", res.data);

        // Lògica robusta: si res.data és un array, l'usem. 
        // Si és un objecte amb .results, usem els results.
        const llistaFinal = Array.isArray(res.data) 
          ? res.data 
          : (res.data.results || []);

        setData(llistaFinal);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error connectant al backend:", err);
        setError("No s'ha pogut connectar amb el Backend. Està el servidor Django encès?");
        setLoading(false);
      });
  }, []);

  // Estils interns per evitar errors de "variable not defined"
  const styles = {
    container: { padding: '20px', color: '#333' },
    card: {
      padding: '15px',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      borderLeft: '5px solid #3498db',
      marginBottom: '10px',
      color: '#2c3e50'
    },
    errorBox: {
      padding: '15px',
      backgroundColor: '#fee2e2',
      color: '#dc2626',
      borderRadius: '8px',
      border: '1px solid #f87171',
      marginBottom: '20px'
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={{ color: '#2c3e50' }}>📡 Prova de Connexió</h1>
      <p>Aquesta pantalla verifica que React pot llegir la base de dades de Django.</p>

      {loading && <p>Carregant magatzems...</p>}

      {error && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ marginTop: '20px' }}>
          <h3>Llista de Magatzems:</h3>
          {data.length === 0 ? (
            <p>No hi ha magatzems creats. Prova de crear-ne un a l'admin de Django.</p>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {data.map((m) => (
                <div key={m.codi_magatzem || Math.random()} style={styles.card}>
                  <strong>Codi:</strong> {m.codi_magatzem} <br />
                  <small style={{ color: '#7f8c8d' }}>ID Intern: {m.id || 'N/A'}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TestApi;