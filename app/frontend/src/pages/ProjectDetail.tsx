import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ArrowLeft, 
  Plus, 
  Settings,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { apiService, type Project, type SubscriptionPlan } from '../services/api'
import { useSmartAccount } from '../hooks/useSmartAccount'
import { useSmartAccountContractWriter } from '../hooks/useSmartAccountContractWriter'
import { parseUnits } from 'viem'
import { useAuth } from '../hooks/useAuth'

interface ProjectDetailsData {
  project: Project
  subscription_plans: SubscriptionPlan[]
}

const ProjectDetail = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const { userInfo } = useAuth()
  const { smartAccountResult } = useSmartAccount()
  const { createPlansBatchWithSmartAccount } = useSmartAccountContractWriter()
  
  const [projectData, setProjectData] = useState<ProjectDetailsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCreatingPlan, setIsCreatingPlan] = useState(false)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const loadingRef = useRef(false)
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string; type: 'plan' } | null>(null)

  const [planFormData, setPlanFormData] = useState({
    name: '',
    price: 0,
    token_address: '',
    period_seconds: 2592000 // 30 days default
  })

  const loadProjectDetails = useCallback(async (forceRefresh = false) => {
    if (!projectId || loadingRef.current) return

    const cacheKey = `project_details_${projectId}`

    if (!forceRefresh) {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { data: ProjectDetailsData; timestamp: number }
          const isExpired = Date.now() - parsed.timestamp > 2 * 60 * 1000
          if (!isExpired && parsed.data) {
            setProjectData(parsed.data)
            return
          }
        } catch (cacheError) {
          console.error('Error parsing cached project details:', cacheError)
        }
      }
    }

    loadingRef.current = true
    setIsLoading(true)
    try {
      const result = await apiService.getProjectDetails(projectId)
      if (result.success && result.data) {
        const wrappedData = result.data as { success?: boolean; data?: ProjectDetailsData }
        const actualData = wrappedData.success ? wrappedData.data! : result.data
        setProjectData(actualData)
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data: actualData, timestamp: Date.now() }))
        } catch (storageError) {
          console.error('Error caching project details:', storageError)
        }
      } else {
        console.error('Failed to load project details:', result.error)
      }
    } catch (err) {
      console.error('Error loading project details:', err)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [projectId])

  useEffect(() => {
    const tokenAddress = projectData?.project?.supported_token?.token_address
    if (!tokenAddress) return

    setPlanFormData((prev) => ({
      ...prev,
      token_address: tokenAddress
    }))
  }, [projectData?.project?.supported_token?.token_address])

  useEffect(() => {
    if (projectId) {
      loadProjectDetails()
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userInfo?.email || !projectId) return

    const subscriptionManagerAddress = projectData?.project?.subscription_manager_address
    const tokenAddress = projectData?.project?.supported_token?.token_address
    const smartAccount = smartAccountResult?.smartAccount

    if (!subscriptionManagerAddress || !tokenAddress || !smartAccount) {
      setCreateResult({
        success: false,
        message: 'Missing smart account or project contract configuration',
        type: 'plan'
      })
      return
    }

    const existingPlanCount = projectData?.subscription_plans?.length || 0
    if (existingPlanCount >= 5) {
      setCreateResult({
        success: false,
        message: 'Maximum of 5 plans per project reached',
        type: 'plan'
      })
      return
    }

    const plansToCreate = [
      {
        contract_plan_id: existingPlanCount + 1,
        name: planFormData.name.trim(),
        price: planFormData.price,
        period_seconds: planFormData.period_seconds,
      },
    ]

    if (!plansToCreate.every((plan) => plan.name && plan.price > 0 && plan.period_seconds > 0)) {
      setCreateResult({
        success: false,
        message: 'Plan name, price, and billing period must be provided',
        type: 'plan'
      })
      return
    }

    const planNames = plansToCreate.map((plan) => plan.name)
    const planPrices = plansToCreate.map((plan) => parseUnits(plan.price.toString(), 18))
    const planPeriods = plansToCreate.map((plan) => BigInt(plan.period_seconds))
    const planTokens = plansToCreate.map(() => tokenAddress as `0x${string}`)

    setIsCreatingPlan(true)
    try {
      const { txHash, plans } = await createPlansBatchWithSmartAccount(
        smartAccount,
        subscriptionManagerAddress as `0x${string}`,
        planNames,
        planPrices,
        planPeriods,
        planTokens
      )

      const plansPayload = plans.length
        ? plans.map((plan, index) => ({
            contract_plan_id: plansToCreate[index]?.contract_plan_id ?? Number(plan.planId),
            name: plansToCreate[index]?.name || `Plan ${Number(plan.planId)}`,
            price: Number(plan.price),
            token_address: plan.tokenAddress,
            period_seconds: Number(plan.periodSeconds),
          }))
        : plansToCreate.map((plan) => ({
            contract_plan_id: plan.contract_plan_id,
            name: plan.name,
            price: plan.price,
            token_address: tokenAddress,
            period_seconds: plan.period_seconds,
          }))

      const result = await apiService.createSubscriptionPlan({
        developer_email: userInfo.email,
        project_id: projectId,
        tx_hash: txHash,
        plans: plansPayload,
      })

      if (result.success) {
        setCreateResult({
          success: true,
          message: 'Subscription plan created successfully!',
          type: 'plan'
        })
        setPlanFormData({
          name: '',
          price: 0,
          token_address: projectData?.project?.supported_token?.token_address || '',
          period_seconds: 2592000
        })
        setShowPlanForm(false)
        await loadProjectDetails(true)
      } else {
        setCreateResult({
          success: false,
          message: result.error || 'Failed to create subscription plan',
          type: 'plan'
        })
      }
    } catch {
      setCreateResult({
        success: false,
        message: 'An error occurred while creating the subscription plan',
        type: 'plan'
      })
    } finally {
      setIsCreatingPlan(false)
    }
  }

  const formatPeriod = (seconds: number) => {
    const days = seconds / 86400
    if (days >= 30) {
      return `${Math.round(days / 30)} month(s)`
    }
    return `${Math.round(days)} day(s)`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl font-medium text-gray-600">Loading project details...</div>
      </div>
    )
  }

  if (!projectData || !projectData.project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Project not found</h1>
          <button
            onClick={() => navigate('/home/developers')}
            className="px-6 py-3 font-bold text-lg"
            style={{
              backgroundColor: '#4ecdc4',
              border: '3px solid #000000',
              boxShadow: '2px 2px 0px #000000'
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <motion.button
              onClick={() => navigate('/home/developers')}
              whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
              whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
              transition={{ duration: 0.1 }}
              className="p-3"
              style={{
                backgroundColor: '#ff6b6b',
                border: '3px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
            >
              <ArrowLeft size={20} />
            </motion.button>
            
            <div>
              <h1 className="text-4xl font-black text-black">{projectData.project.name}</h1>
            </div>
          </div>

          <div className="flex space-x-4">
            <motion.button
              onClick={() => setShowPlanForm(!showPlanForm)}
              whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
              whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
              transition={{ duration: 0.1 }}
              className="px-6 py-3 font-bold text-lg flex items-center space-x-2"
              style={{
                backgroundColor: '#95e1d3',
                border: '3px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
            >
              <Plus size={20} />
              <span>New Plan</span>
            </motion.button>
          </div>
        </div>

        {/* Create Subscription Plan Form */}
        {showPlanForm && (
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
            <h2 className="text-2xl font-black text-black mb-4">Create Subscription Plan</h2>
            
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-lg font-bold text-black mb-2">Plan ID</label>
                  <input
                    type="number"
                    value={(projectData?.subscription_plans?.length || 0) + 1}
                    readOnly
                    className="w-full px-4 py-3 text-lg font-medium bg-gray-100"
                    style={{
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                  />
                </div>

                <div>
                  <label className="block text-lg font-bold text-black mb-2">Plan Name</label>
                  <input
                    type="text"
                    value={planFormData.name}
                    onChange={(e) => setPlanFormData({ ...planFormData, name: e.target.value })}
                    required
                    className="w-full px-4 py-3 text-lg font-medium"
                    style={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                    placeholder="Premium Plan"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-lg font-bold text-black mb-2">
                    Price ({projectData?.project?.supported_token?.symbol || 'Token'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={planFormData.price}
                    onChange={(e) => setPlanFormData({ ...planFormData, price: parseFloat(e.target.value) })}
                    required
                    min="0"
                    className="w-full px-4 py-3 text-lg font-medium"
                    style={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                    placeholder={`9.99 ${projectData?.project?.supported_token?.symbol || ''}`.trim()}
                  />
                </div>

                <div>
                  <label className="block text-lg font-bold text-black mb-2">Period (seconds)</label>
                  <input
                    type="number"
                    value={planFormData.period_seconds}
                    onChange={(e) => setPlanFormData({ ...planFormData, period_seconds: parseInt(e.target.value, 10) || 0 })}
                    required
                    min="1"
                    className="w-full px-4 py-3 text-lg font-medium"
                    style={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #000000',
                      boxShadow: '2px 2px 0px #000000'
                    }}
                    placeholder="2592000"
                  />
                  <p className="text-sm text-gray-600 mt-2">Enter billing interval in seconds (e.g. 2592000 for 30 days).</p>
                </div>
              </div>

              <div>
                <label className="block text-lg font-bold text-black mb-2">Token Address</label>
                <input
                  type="text"
                  value={planFormData.token_address}
                  readOnly
                  className="w-full px-4 py-3 text-lg font-medium"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                  placeholder="0x..."
                />
                <p className="text-sm text-gray-600 mt-2">This value is derived from the project's supported token.</p>
              </div>

              <div className="flex space-x-4">
                <motion.button
                  type="submit"
                  disabled={isCreatingPlan}
                  whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                  whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                  transition={{ duration: 0.1 }}
                  className="px-6 py-3 font-bold text-lg"
                  style={{
                    backgroundColor: '#95e1d3',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                >
                  {isCreatingPlan ? 'Creating...' : 'Create Plan'}
                </motion.button>

                <motion.button
                  type="button"
                  onClick={() => setShowPlanForm(false)}
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

        {/* Subscription Plans */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-black flex items-center space-x-2">
            <DollarSign size={24} />
            <span>Subscription Plans</span>
          </h2>

          {projectData.subscription_plans.length === 0 ? (
            <div className="text-center py-12">
              <Settings size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-xl font-bold text-gray-600 mb-2">No subscription plans yet</h3>
              <p className="text-gray-500">Create your first subscription plan to start monetizing</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projectData.subscription_plans.map((plan) => (
                <motion.div
                  key={plan.id}
                  whileHover={{ x: 1, y: 1, boxShadow: '3px 3px 0px #000000' }}
                  className="p-6"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '3px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-black">{plan.name}</h3>
                      <p className="text-sm text-gray-500">Plan ID: {plan.contract_plan_id}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-2">
                        <DollarSign size={16} />
                        <span className="font-medium">Price</span>
                      </span>
                      <span className="font-bold">{plan.price} {plan.token_symbol}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-2">
                        <Clock size={16} />
                        <span className="font-medium">Period</span>
                      </span>
                      <span className="font-bold">{formatPeriod(plan.period_seconds)}</span>
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

export default ProjectDetail
