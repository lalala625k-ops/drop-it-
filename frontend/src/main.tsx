import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserMigration } from './components/BrowserMigration';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has('migrate') ? <BrowserMigration /> : <App />}
  </React.StrictMode>
);
