import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<div>Catálogo (em construção)</div>} />
      </Route>
    </Routes>
  );
}

export default App;
