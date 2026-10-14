import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TooltipProvider } from './components/ui/tooltip';
import { ValueMenu } from './components/ValueMenu';
import './index.css';
import { devtools, hostTheme } from './lib/devtools';

const theme = devtools && hostTheme();
if (theme) document.documentElement.dataset.theme = theme;

if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Installable and offline only; the page works without it.
  });
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <TooltipProvider delayDuration={300} disableHoverableContent>
        <App />
        <ValueMenu />
      </TooltipProvider>
    </StrictMode>,
  );
}
