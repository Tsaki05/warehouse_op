import { Link } from 'react-router-dom';

const Home = () => {
  const moduls = [
    { titol: 'Ubicació de Productes', icona: '📥', ruta: '/ubicar', desc: 'Sòls per a Superiors: Ubicar lots nous.', color: '#3498db' },
    { titol: 'Preparar Comandes', icona: '📦', ruta: '/comandes', desc: 'Mossos: Llistat de paquets per preparar.', color: '#2ecc71' },
    { titol: 'Facturació', icona: '📄', ruta: '/factures', desc: 'Gestió de factures i clients.', color: '#f1c40f' },
    { titol: 'Estoc i Magatzems', icona: '🏢', ruta: '/test', desc: 'Consulta de inventari i ubicacions.', color: '#e67e22' },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: '10px' }}>Benvingut al Sistema de Gestió</h1>
      <p style={{ color: '#7f8c8d', marginBottom: '30px' }}>Selecciona una tasca per començar la jornada.</p>

      <div style={styles.grid}>
        {moduls.map((m) => (
          <Link key={m.titol} to={m.ruta} style={styles.card}>
            <div style={{ ...styles.iconBadge, backgroundColor: m.color }}>{m.icona}</div>
            <div style={styles.cardContent}>
              <h3 style={styles.cardTitle}>{m.titol}</h3>
              <p style={styles.cardDesc}>{m.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '12px',
    textDecoration: 'none',
    color: 'inherit',
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    border: '1px solid #eee',
  },
  iconBadge: {
    width: '60px',
    height: '60px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.8rem',
    marginRight: '20px',
    color: 'white',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    margin: '0 0 5px 0',
    fontSize: '1.2rem',
    color: '#2c3e50',
  },
  cardDesc: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#95a5a6',
  },
};

export default Home;