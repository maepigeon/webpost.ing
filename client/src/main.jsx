import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App.jsx'
import { installClickFlash } from './utils/clickFlash.js'
import { BrowserRouter } from 'react-router-dom';

import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import rootReducer from './reducers'
import { DialogProvider } from './components/Dialog/Dialog.jsx'

const store = configureStore({
  reducer: rootReducer
})

installClickFlash();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Provider store={store}>
        <DialogProvider>
          <App/>
        </DialogProvider>
      </Provider>
    </BrowserRouter>
  </StrictMode>
)
