import { BrowserRouter } from 'react-router-dom';
import { Providers } from './app/providers';
import { AppRouter } from './app/router';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AppRouter />
      </Providers>
    </BrowserRouter>
  );
}

export default App;
