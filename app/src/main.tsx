import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { api } from './lib/plugins';
import './styles.css';

window.devpul = api;

if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Installable and offline only; the page works without it.
  });
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
