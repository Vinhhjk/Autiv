import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { SubscriptionModal } from '../components/SubscriptionModal'
import { SubscriptionPlanCard } from '../components/SubscriptionPlanCard'
import { useSimpleContractReader } from '../hooks/useSimpleContractReader'
import type { SubscriptionPlan } from '../types/subscription'
import { useAccount } from '../hooks/usePrivyWagmiAdapter'
import DemoDashboard from '../components/DemoDashboard'
import DemoViewToggle from '../components/DemoViewToggle'
import { useSmartAccount } from '../hooks/useSmartAccount'
import { useSmartAccountContractWriter } from '../hooks/useSmartAccountContractWriter'
import { useAuth } from '../hooks/useAuth'

type SmartAccount = {
  address: `0x${string}`
  isDeployed: () => Promise<boolean>
  [key: string]: unknown
}

const Demo = () => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeView, setActiveView] = useState<'plans' | 'dashboard'>('plans')
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const { isConnected } = useAccount()
  const { createSmartAccount, smartAccountResult } = useSmartAccount()
  const { claimMockUSDCWithSmartAccount } = useSmartAccountContractWriter()
  const { authenticated, isInitialized } = useAuth()
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimStatus, setClaimStatus] = useState<'idle' | 'success' | 'error' | 'warning'>('idle')
  const [claimMessage, setClaimMessage] = useState<string | null>(null)
  const demoProjectId = import.meta.env.VITE_DEMO_PROJECT_ID || ''
  const { getAllPlans, isLoading, error } = useSimpleContractReader(demoProjectId)

  const loadPlans = useCallback(async () => {
    const storageKey = `demo_plans_loaded_${demoProjectId || 'default'}`
    const alreadyLoaded = sessionStorage.getItem(storageKey)
    const sharedFeatures = [
      'MetaMask Smart Account integration',
      'Automated subscription payments',
      'USDC payment support',
      'Basic support',
      'Standard features'
    ]
    const fallbackPlans: SubscriptionPlan[] = [
      {
        id: '1',
        name: '1 Minute Test',
        price: 1,
        duration: 60,
        durationText: '1 minute',
        features: sharedFeatures,
        tokenSymbol: 'USDC'
      },
      {
        id: '2',
        name: '2 Minutes Test',
        price: 2,
        duration: 120,
        durationText: '2 minutes',
        features: sharedFeatures,
        tokenSymbol: 'USDC'
      },
      {
        id: '3',
        name: '5 Minutes Test',
        price: 5,
        duration: 300,
        durationText: '5 minutes',
        features: sharedFeatures,
        tokenSymbol: 'USDC'
      }
    ].map((plan) => ({ ...plan, description: '' } as SubscriptionPlan))
    try {
      const contractPlans = await getAllPlans()
      
      if (contractPlans && contractPlans.length > 0) {
        setPlans(contractPlans as SubscriptionPlan[])
        sessionStorage.setItem(storageKey, 'true')
      } else if (!alreadyLoaded) {
        setPlans(fallbackPlans)
      }
    } catch (err) {
      console.error('Error loading plans:', err)
      setPlans(fallbackPlans)
    }
  }, [demoProjectId, getAllPlans])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  useEffect(() => {
    if (authenticated && isInitialized) {
      loadPlans()
    }
  }, [authenticated, isInitialized, loadPlans])

  const handlePlanSelect = (planId: string) => {
    const plan = plans.find(p => p.id === planId)
    if (plan) {
      setSelectedPlan(plan)
      setIsModalOpen(true)
    }
  }

  const handleClaimTokens = useCallback(async () => {
    if (!isConnected) {
      setClaimStatus('warning')
      setClaimMessage('Please login to claim tokens.')
      return
    }

    try {
      setIsClaiming(true)
      setClaimStatus('idle')
      setClaimMessage(null)

      let smartAccount = smartAccountResult?.smartAccount as SmartAccount | undefined
      if (!smartAccount) {
        const created = await createSmartAccount()
        if (!created?.smartAccount) {
          throw new Error('Unable to initialize smart account')
        }
        smartAccount = created.smartAccount as SmartAccount
      }

      await claimMockUSDCWithSmartAccount(smartAccount)
      setClaimStatus('success')
      setClaimMessage(`Claimed!`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim tokens'
      setClaimStatus('error')
      setClaimMessage(message)
    } finally {
      setIsClaiming(false)
    }
  }, [isConnected, createSmartAccount, smartAccountResult, claimMockUSDCWithSmartAccount])

  const claimFeedback = claimStatus !== 'idle' && claimMessage ? (
    <div
      className="text-sm font-bold px-4 py-2"
      style={
        claimStatus === 'success'
          ? { backgroundColor: '#d1fae5', border: '2px solid #10b981', color: '#065f46' }
          : claimStatus === 'error'
            ? { backgroundColor: '#fee2e2', border: '2px solid #f87171', color: '#7f1d1d' }
            : { backgroundColor: '#fef3c7', border: '2px solid #facc15', color: '#78350f' }
      }
    >
      {claimMessage}
    </div>
  ) : null

  return (
    <div className="min-h-screen pt-8 pb-20 px-4 sm:px-6 lg:px-8 relative">
      {/* Retro Geometric Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-16 h-16 transform rotate-45" style={{ backgroundColor: '#ff6b6b' }}></div>
        <div className="absolute top-40 right-20 w-12 h-12 rounded-full" style={{ backgroundColor: '#feca57' }}></div>
        <div className="absolute bottom-40 left-20 w-20 h-20" style={{ backgroundColor: '#4ecdc4' }}></div>
        <div className="absolute bottom-20 right-10 w-14 h-14 rounded-full" style={{ backgroundColor: '#836EF9' }}></div>
      </div>

      <div className="max-w-7xl mx-auto relative">
        {/* View Toggle */}
        <div className="mb-12">
          <div className="flex justify-center">
            <DemoViewToggle
              activeView={activeView}
              onViewChange={setActiveView}
            />
          </div>
          <div className="mt-6 flex flex-col sm:flex-row justify-center items-center gap-3">
            <button
              onClick={handleClaimTokens}
              disabled={isClaiming || !isConnected}
              className={`retro-button px-6 py-3 font-black text-lg transition-all duration-200 ${(!isConnected || isClaiming) ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ backgroundColor: '#4ecdc4' }}
            >
              {isClaiming ? 'Claiming Mock USDC...' : 'Claim Mock USDC'}
            </button>
            {claimFeedback}
          </div>
        </div>

        {/* Conditional Content */}
        {activeView === 'dashboard' ? (
          <DemoDashboard />
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-16">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl md:text-6xl font-black text-black mb-6"
              >
                Choose Your <span className="gradient-text">Plan</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-xl text-gray-800 font-medium"
              >
                Subscribe with USDC on Monad Testnet using <span className="font-black" style={{ color: '#836EF9' }}>MetaMask Smart Accounts</span>
              </motion.p>

              {!isConnected && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mt-6 max-w-md mx-auto"
                >
                  <p className="text-yellow-800 text-sm font-medium">
                    Please login to subscribe to a plan
                  </p>
                </motion.div>
              )}
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                <p className="mt-4 text-gray-600 font-medium">Loading subscription plans...</p>
              </div>
            )}

            {/* Error State (only if no plans to show) */}
            {error && plans.length === 0 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 max-w-2xl mx-auto mb-8">
                <h3 className="text-red-800 font-bold text-lg mb-2">Error Loading Plans</h3>
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {/* Plan Cards */}
            {!isLoading && (
              <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {plans && plans.length > 0 ? (
                  plans.map((plan, index) => (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + index * 0.1 }}
                    >
                      <SubscriptionPlanCard
                        plan={plan}
                        onSelect={isConnected ? handlePlanSelect : undefined}
                        isSelected={selectedPlan?.id === plan.id}
                        disabled={!isConnected}
                      />
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-3 text-center py-12">
                    <p className="text-gray-600 font-medium">No subscription plans available</p>
                    <p className="text-gray-500 text-sm mt-2">Plans will appear here once deployed</p>
                  </div>
                )}
              </div>
            )}

            {/* Demo Instructions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="mt-16 bg-white p-8 max-w-4xl mx-auto transition-all duration-300"
              style={{
                boxShadow: '8px 8px 0px #000000, 16px 16px 0px #e0e0e0',
                border: '3px solid #000000'
              }}
            >
              <h3 className="text-2xl font-black text-black mb-6 text-center">
                Demo Instructions
              </h3>
              <div className="grid md:grid-cols-2 gap-6 text-gray-800">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 flex items-center justify-center text-black font-black text-lg" style={{ backgroundColor: '#feca57', border: '2px solid #000000' }}>1</div>
                  <p className="font-medium">Connect your wallet and select a plan</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 flex items-center justify-center text-black font-black text-lg" style={{ backgroundColor: '#ff6b6b', border: '2px solid #000000' }}>2</div>
                  <p className="font-medium">Smart Account automatically handles delegation</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 flex items-center justify-center text-black font-black text-lg" style={{ backgroundColor: '#4ecdc4', border: '2px solid #000000' }}>3</div>
                  <p className="font-medium">Pay with USDC on Monad Testnet</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 flex items-center justify-center text-white font-black text-lg" style={{ backgroundColor: '#836EF9', border: '2px solid #000000' }}>4</div>
                  <p className="font-medium">Smart Account handles automatic renewals</p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                <p className="text-blue-800 text-sm font-medium text-center">
                  <strong>Powered by MetaMask Smart Accounts:</strong> Automatic subscription management on Monad Testnet
                </p>
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* Subscription Modal */}
      <SubscriptionModal
        plan={selectedPlan}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}



export default Demo