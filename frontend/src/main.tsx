import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ResetPassword from './pages/ResetPassword.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'

// Minimal path routing: the reset-password flow must work while logged out
// and outside the gated app.
const isResetPassword = window.location.pathname === '/reset-password';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {isResetPassword ? <ResetPassword /> : <App />}
    </AuthProvider>
  </StrictMode>,
)
