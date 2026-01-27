
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Maintenance from './Maintenance';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const IS_MAINTENANCE_MODE = true; 

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {IS_MAINTENANCE_MODE ? <Maintenance /> : <App />}
  </React.StrictMode>
);
