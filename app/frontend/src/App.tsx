import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Toast from './components/Toast'
import { AuthProvider } from './contexts/AuthContext'
import { SubscriptionProvider } from './context/SubscriptionContext'
import { SmartAccountProvider } from './contexts/SmartAccountContext'

function App() {
  const [toast, setToast] = useState({ isVisible: false, message: '', type: 'info' as const })
  const location = useLocation()
  
  // Don't show header on /home pages (they have their own sidebar navigation)
  const showHeader = !location.pathname.startsWith('/home')

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
    <SmartAccountProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <div className="min-h-screen" style={{ backgroundColor: '#f0f0f0' }}>
            {showHeader && <Header />}
            <Outlet />
            <Toast
              isVisible={toast.isVisible}
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
            />
          </div>
        </SubscriptionProvider>
      </AuthProvider>
    </SmartAccountProvider>
  )
}

export default App
