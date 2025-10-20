import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Toast from './components/Toast'
import { AuthProvider } from './contexts/AuthContext'
import { SmartAccountProvider } from './contexts/SmartAccountContext'

function App() {
  const [toast, setToast] = useState({ isVisible: false, message: '', type: 'info' as const })
  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent
      setToast({ isVisible: true, ...customEvent.detail })
      setTimeout(() => setToast(prev => ({ ...prev, isVisible: false })), 3000)
    }

    window.addEventListener('showToast', handleToast)
    return () => window.removeEventListener('showToast', handleToast)
  }, [])

  return (
    <AuthProvider>
      <SmartAccountProvider>
          <div className="min-h-screen" style={{ backgroundColor: '#f0f0f0' }}>
            <Outlet />
            <Toast
              isVisible={toast.isVisible}
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
            />
          </div>
      </SmartAccountProvider>
    </AuthProvider>
  )
}

export default App
