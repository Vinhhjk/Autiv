import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Plus, 
  Folder, 
  Settings, 
  CheckCircle, 
  AlertCircle,
  Key,
  Trash2
} from 'lucide-react'
import { apiService, type Project, type TokenMetadata } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import DeveloperRegistration from './DeveloperRegistration'
import { createPublicClient, http, parseUnits } from 'viem'
import { monadTestnet } from 'viem/chains'
import { useSmartAccount } from '../hooks/useSmartAccount'
import { useSmartAccountContractWriter } from '../hooks/useSmartAccountContractWriter'

const ERC20_DECIMALS_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  }
]

const generatePlanId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const DeveloperDashboard = () => {
  const navigate = useNavigate()
  const { userInfo, isDeveloper, refreshDeveloperData } = useAuth()
  const { smartAccountResult, createSmartAccount } = useSmartAccount()
  const { deploySubscriptionManager } = useSmartAccountContractWriter()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showRegistrationForm, setShowRegistrationForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isCheckingDeveloper, setIsCheckingDeveloper] = useState(false)
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string } | null>(null)

  const [supportedTokens, setSupportedTokens] = useState<TokenMetadata[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null)
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false)

  const [plans, setPlans] = useState<Array<{ id: string; name: string; price: string; period_seconds: string }>>([
    { id: generatePlanId(), name: '', price: '', period_seconds: '' }
  ])

  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: monadTestnet,
      transport: http('https://monad-testnet.drpc.org')
    })
  }, [])

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    supported_token_address: ''
  })

  const selectedToken = useMemo(
    () => supportedTokens.find((token) => token.token_address === formData.supported_token_address) || null,
    [formData.supported_token_address, supportedTokens]
  )

  const tokenDropdownRef = useRef<HTMLDivElement | null>(null)

  const loadSupportedTokens = useCallback(async () => {
    if (isLoadingTokens || supportedTokens.length > 0) return
    setIsLoadingTokens(true)
    try {
      const result = await apiService.getSupportedTokens()
      if (result.success && result.data) {
        setSupportedTokens(result.data.tokens)
      }
    } catch (error) {
      console.error('Failed to load supported tokens', error)
      window.dispatchEvent(
        new CustomEvent('showToast', {
          detail: {
            message: 'Failed to load supported tokens',
            type: 'error',
          },
        })
      )
    } finally {
      setIsLoadingTokens(false)
    }
  }, [isLoadingTokens, supportedTokens.length])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!tokenDropdownRef.current) return
      if (!tokenDropdownRef.current.contains(event.target as Node)) {
        setIsTokenDropdownOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTokenDropdownOpen(false)
      }
    }

    if (isTokenDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isTokenDropdownOpen])

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

  useEffect(() => {
    if (showCreateForm) {
      loadSupportedTokens()
    }
  }, [showCreateForm, loadSupportedTokens])

  useEffect(() => {
    const fetchDecimals = async () => {
      if (!formData.supported_token_address) {
        setTokenDecimals(null)
        return
      }

      try {
        const decimals = await publicClient.readContract({
          address: formData.supported_token_address as `0x${string}`,
          abi: ERC20_DECIMALS_ABI,
          functionName: 'decimals'
        })
        setTokenDecimals(Number(decimals))
      } catch (error) {
        console.error('Failed to fetch token decimals', error)
        window.dispatchEvent(
          new CustomEvent('showToast', {
            detail: {
              message: 'Failed to fetch token decimals',
              type: 'error',
            },
          })
        )
        setTokenDecimals(null)
      }
    }

    fetchDecimals()
  }, [formData.supported_token_address, publicClient])

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
    if (!userInfo?.email) {
      window.dispatchEvent(
        new CustomEvent('showToast', {
          detail: {
            message: 'Sign in to create a project',
            type: 'error',
          },
        })
      )
      return
    }

    if (!formData.supported_token_address) {
      window.dispatchEvent(
        new CustomEvent('showToast', {
          detail: {
            message: 'Select a supported token',
            type: 'error',
          },
        })
      )
      return
    }

    if (tokenDecimals == null) {
      window.dispatchEvent(
        new CustomEvent('showToast', {
          detail: {
            message: 'Token decimals unavailable',
            type: 'error',
          },
        })
      )
      return
    }

    const cleanedPlans = plans
      .map((plan) => ({
        name: plan.name.trim(),
        price: plan.price.trim(),
        period_seconds: plan.period_seconds.trim()
      }))
      .filter((plan) => plan.name && plan.price && plan.period_seconds)
      .map((plan) => ({
        ...plan,
        price: Number(plan.price),
        period_seconds: Number(plan.period_seconds)
      }))

    if (cleanedPlans.length === 0) {
      window.dispatchEvent(
        new CustomEvent('showToast', {
          detail: {
            message: 'Add at least one plan',
            type: 'error',
          },
        })
      )
      return
    }

    const planNames = cleanedPlans.map((plan) => plan.name)
    const planPrices = cleanedPlans.map((plan) => parseUnits(plan.price.toString(), tokenDecimals))
    const planPeriods = cleanedPlans.map((plan) => BigInt(plan.period_seconds))
    const planTokens = cleanedPlans.map(() => formData.supported_token_address as `0x${string}`)

    let smartAccount = smartAccountResult?.smartAccount
    if (!smartAccount) {
      try {
        const created = await createSmartAccount()
        smartAccount = created?.smartAccount
      } catch (error) {
        console.error('Failed to initialize smart account', error)
        window.dispatchEvent(
          new CustomEvent('showToast', {
            detail: {
              message: 'Smart account not ready',
              type: 'error',
            },
          })
        )
        return
      }
    }

    if (!smartAccount) {
      window.dispatchEvent(
        new CustomEvent('showToast', {
          detail: {
            message: 'Smart account unavailable',
            type: 'error',
          },
        })
      )
      return
    }

    setIsCreating(true)

    try {
      const ownerAddress = smartAccount.address
      const { txHash } = await deploySubscriptionManager(
        smartAccount,
        ownerAddress,
        planNames,
        planPrices,
        planPeriods,
        planTokens
      )

      const result = await apiService.createProject({
        developer_email: userInfo.email,
        name: formData.name,
        description: formData.description,
        factory_tx_hash: txHash,
        supported_token_address: formData.supported_token_address,
        plans: cleanedPlans
      })

      if (result.success && result.data) {
        setCreateResult({
          success: true,
          message: 'Project created successfully!'
        })
        setFormData({ name: '', description: '', supported_token_address: '' })
        setPlans([{ id: generatePlanId(), name: '', price: '', period_seconds: '' }])
        // Clear cache and refresh projects list
        const cacheKey = `developer_projects_${userInfo.email}`
        localStorage.removeItem(cacheKey)
        await loadProjects()
        
        // Auto-close form after 2 seconds
        setTimeout(() => {
          setShowCreateForm(false)
          setCreateResult(null)
        }, 2000)
        window.dispatchEvent(
          new CustomEvent('showToast', {
            detail: {
              message: 'Project created successfully!',
              type: 'success',
            },
          })
        )
      } else {
        setCreateResult({
          success: false,
          message: result.error || 'Failed to create project'
        })
        window.dispatchEvent(
          new CustomEvent('showToast', {
            detail: {
              message: result.error || 'Failed to create project',
              type: 'error',
            },
          })
        )
      }
    } catch (error) {
      console.error('Project creation failed', error)
      window.dispatchEvent(
        new CustomEvent('showToast', {
          detail: {
            message: 'Project creation failed',
            type: 'error',
          },
        })
      )
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
                <label className="block text-lg font-bold text-black mb-2">Supported Token</label>
                <div ref={tokenDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsTokenDropdownOpen((prev) => !prev)}
                    disabled={isLoadingTokens}
                    className="w-full px-4 py-3 text-lg font-medium flex items-center justify-between"
                    style={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {selectedToken?.image_url ? (
                        <img
                          src={selectedToken.image_url}
                          alt={`${selectedToken.name} logo`}
                          className="w-8 h-8 object-contain rounded-full border border-black"
                        />
                      ) : selectedToken ? (
                        <div className="w-8 h-8 flex items-center justify-center rounded-full border border-black bg-gray-100 text-sm font-bold">
                          {selectedToken.symbol.slice(0, 2).toUpperCase()}
                        </div>
                      ) : null}
                      <span className="text-left">
                        {selectedToken
                          ? `${selectedToken.name} (${selectedToken.symbol})`
                          : isLoadingTokens
                            ? 'Loading tokens...'
                            : 'Select a supported token'}
                      </span>
                    </div>
                    <span className="text-xl leading-none ml-4">▾</span>
                  </button>

                  {isTokenDropdownOpen && (
                    <div
                      className="absolute z-20 mt-2 w-full bg-white border-2 border-black shadow-[2px_2px_0px_#000000] max-h-64 overflow-y-auto"
                      style={{
                        scrollbarWidth: 'thin'
                      }}
                    >
                      {supportedTokens.length === 0 && !isLoadingTokens && (
                        <div className="px-4 py-3 text-base font-medium text-gray-600">
                          No supported tokens found
                        </div>
                      )}
                      {supportedTokens.map((token) => {
                        const isSelected = formData.supported_token_address === token.token_address
                        return (
                          <button
                            key={token.id}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, supported_token_address: token.token_address })
                              setIsTokenDropdownOpen(false)
                            }}
                            className={`w-full px-4 py-3 flex items-center text-left gap-3 transition-colors ${
                              isSelected ? 'bg-gray-100' : 'hover:bg-gray-100'
                            }`}
                          >
                            {token.image_url ? (
                              <img
                                src={token.image_url}
                                alt={`${token.name} logo`}
                                className="w-10 h-10 object-contain rounded-full border border-black"
                              />
                            ) : (
                              <div className="w-10 h-10 flex items-center justify-center rounded-full border border-black bg-gray-100 text-base font-bold">
                                {token.symbol.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="text-lg font-bold text-black">{token.name}</div>
                              <div className="text-sm font-medium text-gray-700">{token.symbol}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-lg font-bold text-black">Subscription Plans</label>
                  <motion.button
                    type="button"
                    onClick={() => setPlans((prev) => [...prev, { id: generatePlanId(), name: '', price: '', period_seconds: '' }])}
                    whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                    whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                    transition={{ duration: 0.1 }}
                    className="px-4 py-2 text-sm font-bold"
                    style={{
                      backgroundColor: '#4ecdc4',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                  >
                    Add Plan
                  </motion.button>
                </div>

                <div className="space-y-4">
                  {plans.map((plan, index) => (
                    <div
                      key={plan.id}
                      className="border-2 border-black p-4"
                      style={{ boxShadow: '2px 2px 0px #000000', backgroundColor: '#f7f7f7' }}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-black text-lg">Plan #{index + 1}</h3>
                        {plans.length > 1 && (
                          <motion.button
                            type="button"
                            onClick={() => setPlans((prev) => prev.filter((item) => item.id !== plan.id))}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="text-red-600"
                          >
                            <Trash2 size={18} />
                          </motion.button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-bold mb-2">Name</label>
                          <input
                            type="text"
                            value={plan.name}
                            onChange={(e) => setPlans((prev) => prev.map((item) => item.id === plan.id ? { ...item, name: e.target.value } : item))}
                            required
                            className="w-full px-3 py-2 text-sm font-medium"
                            style={{
                              backgroundColor: '#ffffff',
                              border: '2px solid #000000',
                              boxShadow: '2px 2px 0px #000000'
                            }}
                            placeholder="Premium"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold mb-2">Price (token units)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.000001"
                            value={plan.price}
                            onChange={(e) => setPlans((prev) => prev.map((item) => item.id === plan.id ? { ...item, price: e.target.value } : item))}
                            required
                            className="w-full px-3 py-2 text-sm font-medium"
                            style={{
                              backgroundColor: '#ffffff',
                              border: '2px solid #000000',
                              boxShadow: '2px 2px 0px #000000'
                            }}
                            placeholder="10"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold mb-2">Period (seconds)</label>
                          <input
                            type="number"
                            min="60"
                            step="1"
                            value={plan.period_seconds}
                            onChange={(e) => setPlans((prev) => prev.map((item) => item.id === plan.id ? { ...item, period_seconds: e.target.value } : item))}
                            required
                            className="w-full px-3 py-2 text-sm font-medium"
                            style={{
                              backgroundColor: '#ffffff',
                              border: '2px solid #000000',
                              boxShadow: '2px 2px 0px #000000'
                            }}
                            placeholder="2592000"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
                      You can access your project with API keys in the <button 
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
