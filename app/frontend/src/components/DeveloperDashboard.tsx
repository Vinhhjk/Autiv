import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Plus, 
  Folder, 
  Settings, 
  CheckCircle, 
  AlertCircle,
  Key
} from 'lucide-react'
import { apiService, type Project } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import DeveloperRegistration from './DeveloperRegistration'

const DeveloperDashboard = () => {
  const navigate = useNavigate()
  const { userInfo, isDeveloper, refreshDeveloperData } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showRegistrationForm, setShowRegistrationForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isCheckingDeveloper, setIsCheckingDeveloper] = useState(false)
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string } | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subscription_manager_address: '',
    token_address: ''
  })

  const loadProjects = useCallback(async () => {
    if (!userInfo?.email || loadingRef.current) return
    
    // Check cache first
    const cacheKey = `developer_projects_${userInfo.email}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached)
        const isExpired = Date.now() - timestamp > 5 * 60 * 1000 // 5 minutes
        if (!isExpired) {
          setProjects(data)
          return
        }
      } catch {
        // Invalid cache, continue to API call
      }
    }
    
    console.log('🌐 Loading projects from API')
    loadingRef.current = true
    setIsLoading(true)
    try {
      const result = await apiService.getDeveloperProjects()
      if (result.success && result.data) {
        setProjects(result.data.projects)
        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify({
          data: result.data.projects,
          timestamp: Date.now()
        }))
      }
    } catch (err) {
      console.error('Error loading projects:', err)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [userInfo?.email])

  // Load projects only when user is a developer
  useEffect(() => {
    if (userInfo?.email && isDeveloper) {
      loadProjects()
    }
  }, [userInfo?.email, isDeveloper]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent body scroll when modals are open
  useEffect(() => {
    if (showCreateForm || showRegistrationForm) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showCreateForm, showRegistrationForm])

  const handleNewProjectClick = async () => {
    setIsCheckingDeveloper(true)
    
    try {
      // Refresh developer data to get the latest status
      await refreshDeveloperData()
      
      // Check if user is now a developer
      if (isDeveloper) {
        // User is a developer, show project creation form
        setShowCreateForm(true)
      } else {
        // User is not a developer, show registration form
        setShowRegistrationForm(true)
      }
    } catch (error) {
      console.error('Error checking developer status:', error)
    } finally {
      setIsCheckingDeveloper(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userInfo?.email) return

    setIsCreating(true)
    try {
      const result = await apiService.createProject({
        developer_email: userInfo.email,
        ...formData
      })

      if (result.success && result.data) {
        setCreateResult({
          success: true,
          message: 'Project created successfully!'
        })
        setFormData({ name: '', description: '', subscription_manager_address: '', token_address: '' })
        // Clear cache and refresh projects list
        const cacheKey = `developer_projects_${userInfo.email}`
        localStorage.removeItem(cacheKey)
        await loadProjects()
        
        // Auto-close form after 2 seconds
        setTimeout(() => {
          setShowCreateForm(false)
          setCreateResult(null)
        }, 2000)
      } else {
        setCreateResult({
          success: false,
          message: result.error || 'Failed to create project'
        })
      }
    } catch {
      setCreateResult({
        success: false,
        message: 'An error occurred while creating the project'
      })
    } finally {
      setIsCreating(false)
    }
  }


  const handleRegistrationSuccess = async () => {
    await refreshDeveloperData()
    setShowRegistrationForm(false)
    // Auto-show project creation form after registration
    setTimeout(() => {
      setShowCreateForm(true)
    }, 500)
    await loadProjects() // Load projects after becoming a developer
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-end">
        <motion.button
          onClick={handleNewProjectClick}
          disabled={isCheckingDeveloper}
          whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
          whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
          transition={{ duration: 0.1 }}
          className="px-6 py-3 font-bold text-lg flex items-center space-x-2"
          style={{
            backgroundColor: '#4ecdc4',
            border: '3px solid #000000',
            boxShadow: '2px 2px 0px #000000'
          }}
        >
          <Plus size={20} />
          <span>{isCheckingDeveloper ? 'Loading...' : 'New Project'}</span>
        </motion.button>
      </div>

      {/* Developer Registration Form - Modal Overlay */}
      {showRegistrationForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setShowRegistrationForm(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="bg-white p-6 border-2 border-black max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: '4px 4px 0px #000000' }}
            onClick={(e) => e.stopPropagation()}
          >
            <DeveloperRegistration onSuccess={handleRegistrationSuccess} />
          </motion.div>
        </motion.div>
      )}

      {/* Create Project Form - Modal Overlay */}
      {showCreateForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setShowCreateForm(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="bg-white p-6 border-2 border-black max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: '4px 4px 0px #000000' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-black text-black mb-6">Create New Project</h2>
            
            <form onSubmit={handleCreateProject} className="space-y-6">
              <div>
                <label className="block text-lg font-bold text-black mb-2">Project Name</label>
                <input
                  type="text"
                  value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-3 text-lg font-medium"
                style={{
                  backgroundColor: '#ffffff',
                  border: '2px solid #000000',
                  boxShadow: '2px 2px 0px #000000'
                }}
                placeholder="My Awesome Project"
              />
              </div>

              <div>
                <label className="block text-lg font-bold text-black mb-2">Description (Optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 text-lg font-medium resize-none"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                  placeholder="Describe what your project does..."
                />
              </div>

              <div>
                <label className="block text-lg font-bold text-black mb-2">Subscription Manager Address</label>
                <input
                  type="text"
                  value={formData.subscription_manager_address}
                  onChange={(e) => setFormData({ ...formData, subscription_manager_address: e.target.value })}
                  required
                  className="w-full px-4 py-3 text-lg font-medium"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-lg font-bold text-black mb-2">Supported Token Address</label>
                <input
                  type="text"
                  value={formData.token_address}
                  onChange={(e) => setFormData({ ...formData, token_address: e.target.value })}
                  required
                  className="w-full px-4 py-3 text-lg font-medium"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                  placeholder="0x..."
                />
                <p className="text-sm text-gray-600 mt-2">
                  Enter the contract address of a token already registered in Supported Tokens.
                </p>
              </div>

              <div className="flex space-x-4">
                <motion.button
                  type="submit"
                  disabled={isCreating}
                  whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                  whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                  transition={{ duration: 0.1 }}
                  className="px-6 py-3 font-bold text-lg"
                  style={{
                    backgroundColor: '#feca57',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                >
                  {isCreating ? 'Creating...' : 'Create Project'}
                </motion.button>

                <motion.button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                  whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                  transition={{ duration: 0.1 }}
                  className="px-6 py-3 font-bold text-lg"
                  style={{
                    backgroundColor: '#ff6b6b',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                >
                  Cancel
                </motion.button>
              </div>
            </form>

            {/* Create Result */}
            {createResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-4 p-4 flex items-start space-x-3`}
                style={{
                  backgroundColor: createResult.success ? '#d4edda' : '#f8d7da',
                  border: '2px solid #000000',
                  boxShadow: '2px 2px 0px #000000'
                }}
              >
                {createResult.success ? (
                  <CheckCircle className="text-green-600 mt-1" size={20} />
                ) : (
                  <AlertCircle className="text-red-600 mt-1" size={20} />
                )}
                <div className="flex-1">
                  <p className="font-bold text-black">{createResult.message}</p>
                  {createResult.success && (
                    <p className="text-sm text-gray-600 mt-1">
                      You can manage your API keys in the <button 
                        onClick={() => navigate('/home/developers/api-keys')}
                        className="text-blue-600 hover:text-blue-800 underline font-medium"
                      >
                        API Keys section
                      </button>.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Projects Grid */}
      <div>
        <h2 className="text-2xl font-black text-black mb-4">Your Projects</h2>
        
        {isLoading ? (
          <div className="text-center py-8">
            <div className="text-lg font-medium text-gray-600">Loading projects...</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8">
            <Folder size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-600">No projects yet</p>
            <p className="text-gray-500">Create your first project to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <motion.div
                key={project.id}
                whileHover={{ x: 1, y: 1, boxShadow: '3px 3px 0px #000000' }}
                className="p-6 cursor-pointer"
                style={{
                  backgroundColor: '#ffffff',
                  border: '3px solid #000000',
                  boxShadow: '4px 4px 0px #000000'
                }}
                onClick={() => {
                  // Navigate to project detail page
                  navigate(`/home/developers/projects/${project.id}`)
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <Folder size={32} className="text-blue-600" />
                  <Settings size={20} className="text-gray-400" />
                </div>
                
                <h3 className="text-xl font-black text-black mb-2">{project.name}</h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">{project.description}</p>
                
                <div className="space-y-3">
                  {project.subscription_manager_address ? (
                    <div>
                      <div className="flex items-center space-x-2">
                        <Key size={16} className="text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Subscription Manager</span>
                      </div>
                      <p className="text-xs font-mono text-gray-600 break-all">
                        {project.subscription_manager_address}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">Subscription manager not configured yet.</p>
                  )}


                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default DeveloperDashboard
