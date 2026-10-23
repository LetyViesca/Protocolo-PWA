import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './assets/estilos/principal.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => console.log('Service Worker registrado con éxito:', reg.scope),
      (err) => console.log('Error al registrar Service Worker:', err)
    );
  });
}