import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
      </Route>
    </Routes>
  );
}

export default App;
