import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import './styles/touch.css'
import './components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tips.css'
import App from './App.jsx'
import { installClickFlash } from './utils/clickFlash.js'
import { installTips } from './utils/tips.js'
import { BrowserRouter } from 'react-router-dom';

import { DialogProvider } from './components/Dialog/Dialog.jsx'

installClickFlash();
installTips();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <DialogProvider>
        <App/>
      </DialogProvider>
    </BrowserRouter>
  </StrictMode>
)
