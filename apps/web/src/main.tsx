import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// skipWaiting/clientsClaim (set in vite.config.ts's workbox config) make a newly installed
// worker activate and take control of this page immediately, without needing a message or a
// fresh navigation — but the plugin's own injected register script never proactively checks
// for updates, so a plain tab reload after a rebuild isn't guaranteed to notice one. This
// hand-rolled registration checks on load, and reloads once the new worker actually takes
// over. Only runs in the production build (there's no /sw.js in `npm run dev`).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      registration.update();
    });
  });
}
