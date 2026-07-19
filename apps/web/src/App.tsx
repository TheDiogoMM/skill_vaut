import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { ItemDetailPage } from './pages/ItemDetailPage.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
      </Route>
    </Routes>
  );
}

export default App;
