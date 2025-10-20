import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
  Key, 
  Plus, 
  Copy, 
  Eye, 
  EyeOff, 
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { apiService, type ApiKey } from '../services/api'
import { useAuth } from '../hooks/useAuth'

const ApiKeysManagement = () => {
  const { userInfo, isDeveloper } = useAuth()
  
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string } | null>(null)
  const loadingRef = useRef(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  })

  const loadApiKeys = useCallback(async () => {
    if (!userInfo?.email || loadingRef.current) return
    
    // Check cache first
    const cacheKey = `developer_api_keys_${userInfo.email}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached)
        const isExpired = Date.now() - timestamp > 5 * 60 * 1000 // 5 minutes
        if (!isExpired) {
          console.log('Loading API keys from cache')
          setApiKeys(data)
          return
        }
      } catch {
        // Invalid cache, continue to API call
      }
    }
    
    console.log('Loading API keys from API')
    loadingRef.current = true
    setIsLoading(true)
    try {
      // We'll need to create a new API endpoint for getting developer's API keys
      const result = await apiService.getDeveloperApiKeys()
      if (result.success && result.data) {
        // Handle double-wrapped response from API service
        const wrappedData = result.data as { success?: boolean; data?: { api_keys: ApiKey[] } }
        const actualData = wrappedData.success ? wrappedData.data! : result.data
        const apiKeysData = actualData.api_keys || []
        setApiKeys(apiKeysData)
        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify({
          data: apiKeysData,
          timestamp: Date.now()
        }))
      }
    } catch (err) {
      console.error('Error loading API keys:', err)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [userInfo?.email])

  useEffect(() => {
    if (userInfo?.email && isDeveloper) {
      loadApiKeys()
    }
  }, [userInfo?.email, isDeveloper]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userInfo?.email) return

    setIsCreating(true)
    setCreateResult(null)

    try {
      const result = await apiService.createDeveloperApiKey({
        developer_email: userInfo.email,
        ...formData
      })

      if (result.success) {
        setCreateResult({
          success: true,
          message: 'API key created successfully!'
        })
        setFormData({ name: '', description: '' })
        // Clear cache and refresh API keys list
        const cacheKey = `developer_api_keys_${userInfo.email}`
        localStorage.removeItem(cacheKey)
        await loadApiKeys() // Reload the list
      } else {
        setCreateResult({
          success: false,
          message: result.error || 'Failed to create API key'
        })
      }
    } catch {
      setCreateResult({
        success: false,
        message: 'An error occurred while creating the API key'
      })
    } finally {
      setIsCreating(false)
    }
  }

  const toggleKeyVisibility = (keyId: string) => {
    const newVisible = new Set(visibleKeys)
    if (newVisible.has(keyId)) {
      newVisible.delete(keyId)
    } else {
      newVisible.add(keyId)
    }
    setVisibleKeys(newVisible)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  if (!isDeveloper) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Developer Access Required</h1>
          <p className="text-gray-600">Create your first project to access.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl font-medium text-gray-600">Loading API keys...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-black">API Keys</h1>
            <p className="text-gray-600 text-lg">Manage your API keys for all projects</p>
          </div>

          <motion.button
            onClick={() => setShowCreateForm(!showCreateForm)}
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
            <span>New API Key</span>
          </motion.button>
        </div>

        {/* Create API Key Form */}
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6"
            style={{
              backgroundColor: '#ffffff',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000'
            }}
          >
            <h2 className="text-2xl font-bold text-black mb-4">Create New API Key</h2>
            
            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="text-lg font-bold text-black mb-2 flex items-center space-x-2">
                  <Key size={20} />
                  <span>Key Name</span>
                </label>
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
                  placeholder="Production API Key"
                />
              </div>

              <div>
                <label className="text-lg font-bold text-black mb-2">
                  Description
                </label>
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
                  placeholder="API key for production environment..."
                />
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
                    backgroundColor: '#4ecdc4',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                >
                  {isCreating ? 'Creating...' : 'Create API Key'}
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
          </motion.div>
        )}

        {/* Result Message */}
        {createResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 flex items-start space-x-3`}
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
            <p className="font-bold text-black">{createResult.message}</p>
          </motion.div>
        )}

        {/* API Keys List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-black flex items-center space-x-2">
            <Key size={24} />
            <span>Your API Keys</span>
          </h2>

          {apiKeys.length === 0 ? (
            <div className="text-center py-12">
              <Key size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-xl font-bold text-gray-600 mb-2">No API keys yet</h3>
              <p className="text-gray-500">Create your first API key to start using the Autiv API</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {apiKeys.map((key) => (
                <motion.div
                  key={key.id}
                  whileHover={{ x: 1, y: 1, boxShadow: '3px 3px 0px #000000' }}
                  className="p-6"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '3px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Key size={20} className="text-blue-600" />
                        <h3 className="text-xl font-bold text-black">{key.name}</h3>
                        <span className={`px-2 py-1 text-xs font-bold rounded ${
                          key.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {key.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      {key.description && (
                        <p className="text-gray-600 mb-3">{key.description}</p>
                      )}

                      <div className="flex items-center space-x-2">
                        <code className="px-3 py-2 bg-gray-100 font-mono text-sm border-2 border-gray-300 flex-1">
                          {visibleKeys.has(key.id) ? key.key_value : '••••••••••••••••••••••••••••••••'}
                        </code>
                        
                        <motion.button
                          onClick={() => toggleKeyVisibility(key.id)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="p-2 border-2 border-gray-300 bg-gray-100 hover:bg-gray-200"
                        >
                          {visibleKeys.has(key.id) ? <EyeOff size={16} /> : <Eye size={16} />}
                        </motion.button>
                        
                        <motion.button
                          onClick={() => copyToClipboard(key.key_value)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="p-2 border-2 border-gray-300 bg-gray-100 hover:bg-gray-200"
                        >
                          <Copy size={16} />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ApiKeysManagement
