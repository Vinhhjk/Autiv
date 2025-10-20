import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Code, ChevronDown, ChevronRight, Menu, X, Play } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useNavigation } from '../hooks/useNavigation'
import ConnectButton from './ConnectButton'

type ActiveView = 'manage-subscription' | 'analytics' | 'developers'

interface SidebarProps {
  activeView: ActiveView
  isOpen: boolean
  onToggle: () => void
}

const Sidebar = ({ activeView, isOpen, onToggle }: SidebarProps) => {
  const [isUserExpanded, setIsUserExpanded] = useState(true)
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false)
  const navigate = useNavigate()
  const { routes, navigateTo } = useNavigation()


  return (
    <>
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 z-[70] p-4">
        <div className="flex items-center space-x-3">
          <motion.button
            onClick={onToggle}
            whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
            whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
            transition={{ duration: 0.1 }}
            className="w-12 h-12 flex items-center justify-center"
            style={{ 
              backgroundColor: '#feca57', 
              border: '3px solid #000000',
              boxShadow: '2px 2px 0px #000000'
            }}
          >
            {isOpen ? <X size={24} className="text-black" /> : <Menu size={24} className="text-black" />}
          </motion.button>
          <Link to={routes.home} className="group">
            <span className="text-2xl font-black text-black hidden md:block">AUTIV</span>
          </Link>
        </div>
      </div>

      {/* Backdrop with Blur - Mobile only */}
      {isOpen && (
        <div 
          className="fixed inset-0 backdrop-blur-sm bg-white/20 z-[60] md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Backdrop - Desktop only */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[60] hidden md:block"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{
          x: isOpen ? 0 : '-100%'
        }}
        transition={{ type: 'tween', duration: 0.3 }}
        className="fixed left-0 top-0 h-full w-64 bg-white border-r-4 border-black z-[65]"
      >
      <div className="p-6 pt-20">

        {/* Connect Button */}
        <div className="mb-8">
          <ConnectButton isSidebarOpen={isOpen} />
        </div>

        {/* Navigation */}
        <nav className="space-y-2">
          {/* User Section */}
          <div>
            <motion.button
              onClick={() => setIsUserExpanded(!isUserExpanded)}
              whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
              whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
              transition={{ duration: 0.1 }}
              className={`
                w-full flex items-center justify-between px-4 py-3 font-bold text-lg
                ${isUserExpanded ? 'bg-gray-100' : ''}
              `}
              style={{
                border: '2px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
            >
              <div className="flex items-center">
                <User className="w-5 h-5 mr-3 text-black" />
                <span className="text-black">User</span>
              </div>
              {isUserExpanded ? (
                <ChevronDown className="w-4 h-4 text-black" />
              ) : (
                <ChevronRight className="w-4 h-4 text-black" />
              )}
            </motion.button>

            <AnimatePresence>
              {isUserExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="ml-4 mt-2 space-y-1"
                >
                  <motion.button
                    onClick={() => navigateTo(routes.userHomeManageSubscription)}
                    whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                    whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                    transition={{ duration: 0.1 }}
                    className={`
                      w-full text-left px-4 py-2 font-medium
                      ${activeView === 'manage-subscription' ? 'bg-blue-100' : 'hover:bg-gray-50'}
                    `}
                    style={{
                      backgroundColor: activeView === 'manage-subscription' ? '#4ecdc4' : 'transparent',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                  >
                    Manage Subscription
                  </motion.button>
                  <motion.button
                    onClick={() => navigateTo(routes.userHomeAnalytics)}
                    whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                    whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                    transition={{ duration: 0.1 }}
                    className={`
                      w-full text-left px-4 py-2 font-medium
                      ${activeView === 'analytics' ? 'bg-blue-100' : 'hover:bg-gray-50'}
                    `}
                    style={{
                      backgroundColor: activeView === 'analytics' ? '#4ecdc4' : 'transparent',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                  >
                    Analytics
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Demo Section */}
          <motion.div
            whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
            whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
            transition={{ duration: 0.1 }}
            style={{
              backgroundColor: 'transparent',
              border: '2px solid #000000',
              boxShadow: '2px 2px 0px #000000'
            }}
          >
            <Link
              to={routes.demo}
              className="w-full flex items-center px-4 py-3 font-bold text-lg"
            >
              <Play className="w-5 h-5 mr-3 text-black" />
              <span className="text-black">Demo</span>
            </Link>
          </motion.div>

          {/* Developers Section */}
          <div>
            <motion.button
              onClick={() => setIsProjectsExpanded(!isProjectsExpanded)}
              whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
              whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
              transition={{ duration: 0.1 }}
              className={`
                w-full flex items-center justify-between px-4 py-3 font-bold text-lg
                ${activeView === 'developers' || isProjectsExpanded ? 'bg-gray-100' : 'hover:bg-gray-50'}
              `}
              style={{
                backgroundColor: activeView === 'developers' ? '#feca57' : 'transparent',
                border: '2px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
            >
              <div className="flex items-center">
                <Code className="w-5 h-5 mr-3 text-black" />
                <span className="text-black">Developers</span>
              </div>
              {isProjectsExpanded ? (
                <ChevronDown className="w-4 h-4 text-black" />
              ) : (
                <ChevronRight className="w-4 h-4 text-black" />
              )}
            </motion.button>

            <AnimatePresence>
              {isProjectsExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="ml-4 mt-2 space-y-1"
                >
                  {/* Projects Link */}
                  <motion.button
                    onClick={() => {
                      navigateTo(routes.userHomeDevelopers)
                      onToggle() // Close sidebar on mobile
                    }}
                    whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                    whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                    transition={{ duration: 0.1 }}
                    className={`
                      w-full text-left px-4 py-2 font-medium
                      ${activeView === 'developers' ? 'bg-blue-100' : 'hover:bg-gray-50'}
                    `}
                    style={{
                      backgroundColor: activeView === 'developers' ? '#4ecdc4' : 'transparent',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                  >
                    Projects
                  </motion.button>

                  {/* API Keys Link */}
                  <motion.button
                    onClick={() => {
                      navigate('/home/developers/api-keys')
                      onToggle() // Close sidebar on mobile
                    }}
                    whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                    whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                    transition={{ duration: 0.1 }}
                    className="w-full text-left px-4 py-2 font-medium hover:bg-gray-50"
                    style={{
                      backgroundColor: 'transparent',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                  >
                    API Keys
                  </motion.button>

                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </nav>
      </div>
    </motion.div>
    </>
  )
}

export default Sidebar