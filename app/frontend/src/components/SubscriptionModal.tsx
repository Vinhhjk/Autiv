import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Zap, Crown, Rocket } from 'lucide-react'
import type { SubscriptionPlan } from '../types/subscription'
import { useAccount } from '../hooks/usePrivyWagmiAdapter'
import { useAuth } from '../hooks/useAuth'
import { apiService, type PaymentSessionStatus } from '../services/api'

interface SubscriptionModalProps {
  plan: SubscriptionPlan | null
  isOpen: boolean
  onClose: () => void
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  plan,
  isOpen,
  onClose
}) => {
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<PaymentSessionStatus | null>(null)
  const [pollingError, setPollingError] = useState<string | null>(null)
  const [lastPolledAt, setLastPolledAt] = useState<number | null>(null)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [pendingPaymentUrl, setPendingPaymentUrl] = useState<string | null>(null)
  const contractConfigRef = useRef<{
    subscriptionManagerAddress: `0x${string}`
    tokenAddress: `0x${string}`
  } | null>(null)

  const { address, isConnected } = useAccount()
  const { refreshUserData } = useAuth()

  const paymentWindowRef = useRef<Window | null>(null)

  const paymentSiteBase = (import.meta.env.VITE_PAYMENT_SITE as string | undefined)?.replace(/\/$/, '') || window.location.origin
  const openPaymentWindow = (paymentPath: string, existingWindow?: Window | null) => {
    const targetUrl = `${paymentSiteBase}${paymentPath}`
    if (existingWindow && !existingWindow.closed) {
      try {
        existingWindow.location.replace(targetUrl)
      } catch (err) {
        console.warn('Failed to reuse payment window, opening new window instead.', err)
        return window.open(targetUrl, '_blank', 'noopener,noreferrer')
      }
      existingWindow.focus()
      return existingWindow
    }
    return window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }

  const getIcon = () => {
    if (!plan) return <Zap className="w-6 h-6 text-black" />
    switch (plan.id) {
      case '0': return <Zap className="w-6 h-6 text-black" />
      case '1': return <Crown className="w-6 h-6 text-black" />
      case '2': return <Rocket className="w-6 h-6 text-black" />
      default: return <Zap className="w-6 h-6 text-black" />
    }
  }

  const getBgColor = () => {
    if (!plan) return '#4ecdc4'
    switch (plan.id) {
      case '0': return '#4ecdc4'  // Retro cyan
      case '1': return '#feca57'    // Yellow for popular plan
      case '2': return '#836EF9'  // Monad Purple for premium
      default: return '#45b7d1'
    }
  }

  const loadContractConfig = async (projectId: string) => {
    if (contractConfigRef.current) return contractConfigRef.current

    try {
      const response = await apiService.getProjectContractConfig(projectId)
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to load project contract configuration')
      }

      const { subscription_manager_address, token_address } = response.data

      if (!subscription_manager_address || !token_address) {
        throw new Error('Project contract configuration is missing required addresses')
      }

      const config = {
        subscriptionManagerAddress: subscription_manager_address as `0x${string}`,
        tokenAddress: token_address as `0x${string}`,
      }

      contractConfigRef.current = config
      return config
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load project contract configuration'
      throw new Error(message)
    }
  }

  const handleSubscribe = async () => {
    if (!plan || !address || !isConnected) return

    setIsSubscribing(true)
    setError(null)
    setPopupBlocked(false)
    setPendingPaymentUrl(null)

    try {
      const contractPlanIdRaw = (plan as unknown as { contract_plan_id?: number; contractPlanId?: number }).contract_plan_id ?? (plan as unknown as { contractPlanId?: number }).contractPlanId
      const projectId = (plan as unknown as { project_id?: string; projectId?: string }).project_id ?? (plan as unknown as { projectId?: string }).projectId

      if (!projectId || contractPlanIdRaw === undefined || contractPlanIdRaw === null) {
        const previewWindow = openPaymentWindow('/pay/preview', paymentWindowRef.current)
        paymentWindowRef.current = previewWindow
        if (!previewWindow) {
          setPopupBlocked(true)
          setPendingPaymentUrl(`${paymentSiteBase}/pay/preview`)
        }
        onClose()
        return
      }

      const contractPlanId = Number(contractPlanIdRaw)
      if (Number.isNaN(contractPlanId)) {
        const previewWindow = openPaymentWindow('/pay/preview', paymentWindowRef.current)
        paymentWindowRef.current = previewWindow
        if (!previewWindow) {
          setPopupBlocked(true)
          setPendingPaymentUrl(`${paymentSiteBase}/pay/preview`)
        }
        onClose()
        return
      }

      const contractConfigData = await loadContractConfig(projectId)

      const response = await apiService.createPaymentSession({
        project_id: projectId,
        contract_plan_id: contractPlanId,
        metadata: {
          planName: plan.name,
          price: plan.price,
          duration: plan.duration,
          subscriptionManagerAddress: contractConfigData.subscriptionManagerAddress,
          tokenAddress: contractConfigData.tokenAddress,
        },
      })

      if (!response.success || !response.data?.session) {
        throw new Error(response.error || 'Failed to create payment session')
      }

      const paymentId = response.data.session.paymentId
      setPaymentSessionId(paymentId)
      const verifyResponse = await apiService.getPaymentSession(paymentId)
      if (!verifyResponse.success || !verifyResponse.data?.session) {
        throw new Error(verifyResponse.error || 'Unable to verify payment session')
      }

      await refreshUserData()

      const paymentWindow = openPaymentWindow(`/pay/${paymentId}`, paymentWindowRef.current)
      paymentWindowRef.current = paymentWindow
      if (!paymentWindow) {
        setPopupBlocked(true)
        setPendingPaymentUrl(`${paymentSiteBase}/pay/${paymentId}`)
      } else {
        setPopupBlocked(false)
        setPendingPaymentUrl(null)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate payment session'
      setError(message)
      console.error('Payment session creation error:', err)
      if (paymentWindowRef.current && !paymentWindowRef.current.closed) {
        paymentWindowRef.current.close()
        paymentWindowRef.current = null
      }
      setPopupBlocked(false)
      setPendingPaymentUrl(null)
    } finally {
      setIsSubscribing(false)
    }
  }

  const handleManualPaymentOpen = () => {
    if (!pendingPaymentUrl) return
    const manualWindow = window.open(pendingPaymentUrl, '_blank', 'noopener,noreferrer')
    paymentWindowRef.current = manualWindow
    if (manualWindow) {
      setPopupBlocked(false)
      setPendingPaymentUrl(null)
    }
  }

  const handleClose = () => {
    setError(null)
    setPaymentSessionId(null)
    setPaymentStatus(null)
    setPollingError(null)
    setLastPolledAt(null)
    setIsSubscribing(false)
    setPopupBlocked(false)
    setPendingPaymentUrl(null)
    onClose()
  }

  useEffect(() => {
    if (!paymentSessionId) return

    let isCancelled = false
    let intervalId: number | null = null

    const pollStatus = async (showError = true) => {
      try {
        const response = await apiService.getPaymentSession(paymentSessionId)
        if (!response.success || !response.data?.session) {
          throw new Error(response.error || 'Failed to check payment status')
        }

        if (isCancelled) return

        const session = response.data.session
        setPaymentStatus(session.status)
        setLastPolledAt(Date.now())
        setPollingError(null)

        if (session.status === 'paid') {
          await refreshUserData()
        }

        if (session.status === 'paid' || session.status === 'expired') {
          if (intervalId !== null) {
            clearInterval(intervalId)
            intervalId = null
          }
          isCancelled = true
        }
      } catch (err) {
        if (isCancelled) return
        if (intervalId !== null) {
          clearInterval(intervalId)
          intervalId = null
        }
        isCancelled = true
        if (showError) {
          const message = err instanceof Error ? err.message : 'Failed to check payment status'
          setPollingError(message)
        }
      }
    }

    pollStatus(false)
    intervalId = window.setInterval(() => {
      pollStatus()
    }, 10000)

    return () => {
      isCancelled = true
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  }, [paymentSessionId, refreshUserData])

  if (!plan) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-50"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="bg-white max-w-lg w-full max-h-[85vh] overflow-y-auto"
            style={{
              border: '4px solid #000000',
              boxShadow: '12px 12px 0px #000000, 24px 24px 0px #e0e0e0'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b-4 border-black">
              <div className="flex items-center space-x-4">
                <div
                  className="w-12 h-12 flex items-center justify-center"
                  style={{ backgroundColor: getBgColor(), border: '3px solid #000000' }}
                >
                  {getIcon()}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-black">{plan.name}</h2>
                  <p className="text-gray-700 font-medium text-sm">{plan.description}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 transition-colors"
                style={{ border: '2px solid #000000' }}
              >
                <X className="w-6 h-6 text-black" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="mb-6">
                <div className="flex items-baseline mb-3">
                  <span className="text-4xl font-black text-black">{plan.price}</span>
                  <span className="text-xl text-black ml-3 font-bold">USDC</span>
                  <span className="text-gray-600 ml-3 text-base font-bold">
                    /{plan.duration === 60 ? 'minute' : plan.duration === 120 ? ' 2minutes' : plan.duration === 300 ? ' 5 minutes' : 'month'}
                  </span>
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center"
                    >
                      <div
                        className="w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0"
                        style={{ backgroundColor: '#96ceb4', border: '2px solid #000000' }}
                      >
                        <Check className="w-5 h-5 text-black" />
                      </div>
                      <span className="text-gray-800 font-medium">{feature}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>

              {popupBlocked && pendingPaymentUrl && paymentStatus !== 'paid' && paymentStatus !== 'expired' && (
                <div className="mb-6 p-4 bg-yellow-100 border-2 border-black">
                  <p className="text-black font-semibold text-sm">
                    If there's no payment window opened, please allow popups in your browser settings or open it manually.
                  </p>
                  <button
                    onClick={handleManualPaymentOpen}
                    className="mt-3 retro-button px-4 py-2 font-black text-sm"
                    style={{ backgroundColor: '#feca57' }}
                  >
                    Open Payment Window
                  </button>
                </div>
              )}

              {error && (
                <div className="mb-6 p-4 bg-red-50 border-2 border-red-300">
                  <p className="text-red-800 font-medium text-sm">{error}</p>
                </div>
              )}

              <div className="flex flex-col space-y-3">
                {!isConnected ? (
                  <div className="text-center p-4 bg-yellow-50 border-2 border-yellow-300">
                    <p className="text-yellow-800 font-medium">Please login to subscribe</p>
                  </div>
                ) : (
                  <div className="flex space-x-4">
                    <button
                      onClick={handleClose}
                      className="retro-button flex-1 py-4 font-black text-xl transition-all duration-200"
                      style={{
                        backgroundColor: '#ff6b6b',
                        color: 'black',
                        border: '2px solid #000000'
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      onClick={handleSubscribe}
                      disabled={isSubscribing || Boolean(paymentSessionId)}
                      className={`
                        retro-button flex-1 py-4 font-black text-xl transition-all duration-200
                        ${isSubscribing || paymentSessionId ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                      style={{ backgroundColor: '#836EF9' }}
                    >
                      {paymentSessionId ? 'Payment window opened' : isSubscribing ? 'Preparing Your Payment...' : 'Continue to Payment'}
                    </button>
                  </div>
                )}

                {paymentSessionId && (
                  <div
                    className="p-4 border-2 border-black bg-gray-50 space-y-2"
                    style={{ boxShadow: '4px 4px 0px #000000' }}
                  >
                    <p className="text-sm font-semibold text-gray-700">
                      Payment ID: <span className="font-black">{paymentSessionId}</span>
                    </p>
                    <p className="text-sm font-semibold text-gray-700">
                      Status: <span className="font-black text-black">{paymentStatus ?? 'pending'}</span>
                    </p>
                    <p className="text-xs text-gray-600">
                      Auto-refreshing every 10 seconds.
                      {lastPolledAt && (
                        <span> Last checked at {new Date(lastPolledAt).toLocaleTimeString()}.</span>
                      )}
                    </p>
                    {pollingError && (
                      <p className="text-xs text-red-600 font-semibold">{pollingError}</p>
                    )}
                    {paymentStatus === 'paid' && (
                      <div className="p-3 border-2 border-black bg-green-100 text-center">
                        <p className="text-sm font-black text-black">Payment confirmed! You can close this window.</p>
                      </div>
                    )}
                    {paymentStatus === 'expired' && (
                      <div className="p-3 border-2 border-black bg-red-100 text-center">
                        <p className="text-sm font-black text-black">Session expired. Please start a new checkout.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}