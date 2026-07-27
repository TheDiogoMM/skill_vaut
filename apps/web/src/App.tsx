import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { ItemDetailPage } from './pages/ItemDetailPage.js';
import { AddPage } from './pages/AddPage.js';
import { RecommendPage } from './pages/RecommendPage.js';
import { DiscoverPage } from './pages/DiscoverPage.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CatalogPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="add" element={<AddPage />} />
        <Route path="recommend" element={<RecommendPage />} />
      </Route>
    </Routes>
  );
}

export default App;
