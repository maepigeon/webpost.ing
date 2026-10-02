import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App.jsx'
import { installClickFlash } from './utils/clickFlash.js'
import { BrowserRouter } from 'react-router-dom';

import { DialogProvider } from './components/Dialog/Dialog.jsx'

installClickFlash();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <DialogProvider>
        <App/>
      </DialogProvider>
    </BrowserRouter>
  </StrictMode>
)
