import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TestApi from './pages/TestApi';
import Home from './pages/Home';

function App() {
  return (
    <Router>
      <div style={styles.container}>
        {/* Sidebar Industrial */}
        <nav style={styles.sidebar}>
          <h2 style={styles.logo}>📦 WAREHOUSE OP</h2>
          <Link to="/" style={styles.link}>Inici</Link>
          <Link to="/test" style={styles.link}>Provar Connexió</Link>
          <div style={styles.status}>
            <p>Usuari: <strong>Superior</strong></p>
          </div>
        </nav>

        {/* Contingut Principal */}
        <main style={styles.main}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/test" element={<TestApi />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#f4f7f6' },
  sidebar: { width: '250px', backgroundColor: '#2c3e50', color: 'white', padding: '20px', display: 'flex', flexDirection: 'column' },
  logo: { fontSize: '1.2rem', marginBottom: '30px', borderBottom: '1px solid #34495e', paddingBottom: '10px' },
  link: { color: '#ecf0f1', textDecoration: 'none', marginBottom: '15px', padding: '10px', borderRadius: '5px', transition: '0.3s' },
  main: { flex: 1, padding: '40px', overflowY: 'auto' },
  status: { marginTop: 'auto', padding: '10px', backgroundColor: '#34495e', borderRadius: '5px', fontSize: '0.8rem' }
};

export default App;