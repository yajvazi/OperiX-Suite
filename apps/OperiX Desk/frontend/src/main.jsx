import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import '@invoice-monorepo/app-shell/styles.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
