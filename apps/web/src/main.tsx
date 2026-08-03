import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { registerServiceWorker } from './pwa-register';

registerServiceWorker();

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Prevent scroll wheel from changing number input values
document.addEventListener(
  'wheel',
  (e) => {
    if (document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'number') {
      e.preventDefault();
    }
  },
  { passive: false },
);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
