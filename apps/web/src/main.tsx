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

// The generated service worker (registerType: 'autoUpdate' in vite.config.ts) only calls
// self.skipWaiting() when it receives a {type: 'SKIP_WAITING'} message — it does not skip
// waiting unconditionally. A newly installed worker otherwise sits in the "waiting" state
// indefinitely (per the standard service worker lifecycle) until every tab is closed and
// reopened. So a fully hands-off update needs three things: (1) proactively check for updates,
// (2) tell any waiting worker to skip waiting as soon as it's found, and (3) reload once the
// new worker actually takes control. Only runs in the production build (there's no /sw.js in
// `npm run dev`).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  function skipWaitingFor(worker: ServiceWorker | null) {
    worker?.postMessage({ type: 'SKIP_WAITING' });
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      skipWaitingFor(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            skipWaitingFor(newWorker);
          }
        });
      });

      registration.update();
    });
  });
}
