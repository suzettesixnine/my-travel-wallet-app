import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // You can create an empty index.css or remove this line if not needed
import App from './App'; // This imports your App.js component

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);