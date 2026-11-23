import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { managementPath } from './preview.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './styles/global.css';
import { ManagementPage } from './features/management/ManagementPage.js';
import './features/management/management.css';

const isManagement = window.location.pathname.replace(/\/$/, '') === managementPath.replace(/\/$/, '');
const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el elemento raíz de la aplicación.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      {isManagement ? <ManagementPage /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
