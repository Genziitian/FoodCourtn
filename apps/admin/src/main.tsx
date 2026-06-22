import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { SessionProvider } from './lib/session';
import './index.css';

// Register the PWA service worker so the admin app is installable on
// desktop + Android. iOS doesn't need a SW for Add-to-Home-Screen.
// Localhost is fine because the SW spec treats it as a secure origin.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update().catch(() => undefined))
      .catch(err => {
        console.warn('Service worker registration failed:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
