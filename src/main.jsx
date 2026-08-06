import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AuthGate from './AuthGate'
import './authConfig'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>{({ cloudEnabled, onSignOut }) => <App cloudEnabled={cloudEnabled} onSignOut={onSignOut} />}</AuthGate>
  </React.StrictMode>,
)
