import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter, Routes, Route } from 'react-router-dom';


import { Provider } from 'react-redux'
import store from './store/store';
// src/reducers/index.js
const initialState = {
  counter: 0
};

const root = document.getElementById('root');
const rootInstance = createRoot(root);

rootInstance.render(
  <StrictMode>
    <BrowserRouter>
      <Provider store={store}>
          <App/>
      </Provider>
    </BrowserRouter>
  </StrictMode>,
)
