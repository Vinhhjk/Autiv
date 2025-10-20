import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'

type ActiveView = 'manage-subscription' | 'analytics' | 'developers'

const Home = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()

  // Determine active view from current URL
  const getActiveViewFromPath = (): ActiveView => {
    const path = location.pathname
    if (path.includes('/analytics')) return 'analytics'
    if (path.includes('/developers')) return 'developers'
    return 'manage-subscription' // default
  }

  const activeView = getActiveViewFromPath()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        activeView={activeView} 
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <main className="flex-1 transition-all duration-300">
        <div className="p-4 md:p-8 pt-20">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default Home