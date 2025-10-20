import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CreditCard, Shield, Clock, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { apiService, type PaymentSession, type PaymentSessionStatus } from '../services/api'
import { useSmartAccount } from '../hooks/useSmartAccount'
import { useSmartAccountContractWriter } from '../hooks/useSmartAccountContractWriter'
import { useMetaMaskDelegation } from '../hooks/useMetaMaskDelegation'

type DisplaySession = {
  paymentId: string
  planName: string
  companyName: string
  amount: number
  tokenSymbol: string
  tokenAddress: string
  billingInterval: string
  nextPaymentDescription: string
  status: PaymentSessionStatus
  expiresAt: number
  billingIntervalSeconds: number
  planId: string
  contractPlanId: number
  metadata: PaymentSession['metadata']
  features: string[]
}

function transformPaymentSession(raw: PaymentSession): DisplaySession {
  const metadata = raw.metadata ?? {}
  const billingIntervalMetadata = typeof metadata.billingInterval === 'string' ? metadata.billingInterval : undefined
  const billingInterval = billingIntervalMetadata ?? raw.billingIntervalText ?? 'Recurring'
  const nextPaymentDescription = typeof metadata.nextPaymentDescription === 'string'
    ? metadata.nextPaymentDescription
    : `Renews automatically every ${billingInterval.toLowerCase()}`
  const features = Array.isArray(metadata.features)
    ? metadata.features.map((feature) => String(feature))
    : []

  return {
    paymentId: raw.paymentId,
    planName: raw.planName,
    companyName: raw.companyName ?? 'Autiv',
    amount: raw.amount,
    tokenSymbol: raw.tokenSymbol,
    tokenAddress: raw.tokenAddress,
    billingInterval,
    nextPaymentDescription,
    status: raw.status,
    expiresAt: raw.expiresAt,
    billingIntervalSeconds: raw.billingIntervalSeconds,
    planId: raw.planId,
    contractPlanId: raw.contractPlanId,
    metadata: raw.metadata,
    features,
  }
}

function formatDuration(secondsRemaining: number) {
  if (secondsRemaining <= 0) return 'Expired'
  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

const statusStyles: Record<PaymentSessionStatus, { label: string; background: string; border: string; text: string }> = {
  pending: {
    label: 'Awaiting Payment',
    background: '#feca57',
    border: '#000000',
    text: '#000000'
  },
  processing: {
    label: 'Processing Payment...',
    background: '#836EF9',
    border: '#000000',
    text: '#ffffff'
  },
  paid: {
    label: 'Payment Confirmed',
    background: '#4ecdc4',
    border: '#000000',
    text: '#000000'
  },
  expired: {
    label: 'Session Expired',
    background: '#ff6b6b',
    border: '#000000',
    text: '#ffffff'
  }
}

const PaymentWindow = () => {
  const { paymentId } = useParams()
  const navigate = useNavigate()
  const { authenticated, login, refreshUserData } = useAuth()
  const {
    createSmartAccount,
    smartAccountResult,
    isLoading: smartAccountLoading,
    error: smartAccountError,
  } = useSmartAccount()
  const {
    subscribeWithSmartAccount,
    isLoading: contractLoading,
    error: contractError,
  } = useSmartAccountContractWriter()
  const {
    createDelegation,
    signDelegation,
    isLoading: delegationLoading,
    error: delegationError,
  } = useMetaMaskDelegation()

  const [session, setSession] = useState<DisplaySession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [delegationStep, setDelegationStep] = useState<'creating' | 'signing' | 'subscribing' | 'finalizing' | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchSession = useCallback(async (showSpinner = false) => {
    if (!paymentId) return
    if (showSpinner) {
      setIsLoading(true)
    }
    try {
      const response = await apiService.getPaymentSession(paymentId)
      if (!response.success || !response.data?.session) {
        throw new Error(response.error || 'Unable to load payment session')
      }
      setSession(transformPaymentSession(response.data.session))
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load payment session'
      setError(message)
    } finally {
      if (showSpinner) {
        setIsLoading(false)
      }
    }
  }, [paymentId])

  useEffect(() => {
    if (!paymentId) {
      setError('Missing payment ID in URL')
      setIsLoading(false)
      return
    }
    setSession(null)
    setError(null)
    fetchSession(true)
  }, [fetchSession, paymentId])

  useEffect(() => {
    if (!session) return
    const interval = setInterval(() => {
      const diffSeconds = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
      setSecondsRemaining(diffSeconds)
      if (diffSeconds <= 0) {
        setSession(prev => (prev ? { ...prev, status: prev.status === 'paid' ? prev.status : 'expired' } : prev))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [session])

  const handleRealPayment = async () => {
    if (!session || !paymentId || session.status === 'paid' || session.status === 'expired') return
    if (!authenticated) return
    setIsProcessingPayment(true)
    setError(null)
    setDelegationStep('creating')
    try {
      let smartAccount = smartAccountResult?.smartAccount
      if (!smartAccount) {
        const created = await createSmartAccount()
        smartAccount = created?.smartAccount
      }

      if (!smartAccount) {
        throw new Error('Smart account is not available. Please try again.')
      }

      if (!session.tokenAddress) {
        throw new Error('Missing token address for this payment session')
      }

      const subscriptionManagerAddress = session.metadata?.subscription_manager_address as `0x${string}` | undefined
      if (!subscriptionManagerAddress) {
        throw new Error('Missing subscription manager address for this payment session')
      }

      const delegationPayload = {
        price: session.amount,
        duration: typeof session.metadata?.duration === 'number' ? session.metadata.duration : session.billingIntervalSeconds,
        tokenAddress: session.tokenAddress,
      }

      const { approveDelegation, processPaymentDelegation } = await createDelegation(
        smartAccount.address,
        subscriptionManagerAddress,
        delegationPayload
      )

      setDelegationStep('signing')
      const signedApproveDelegation = await signDelegation(smartAccount, approveDelegation)
      const signedProcessPaymentDelegation = await signDelegation(smartAccount, processPaymentDelegation)

      setDelegationStep('subscribing')

      await apiService.updatePaymentSession({
        payment_id: paymentId,
        status: 'processing',
      })

      const numericPlanId = Number.isFinite(Number(session.contractPlanId))
        ? Number(session.contractPlanId)
        : Number(session.planId)

      if (!Number.isFinite(numericPlanId)) {
        throw new Error('Invalid plan identifier for subscription')
      }

      const resultingTxHash = await subscribeWithSmartAccount(
        smartAccount,
        Number(numericPlanId),
        session.amount,
        session.tokenAddress,
        subscriptionManagerAddress,
        signedApproveDelegation,
        signedProcessPaymentDelegation
      )

      setDelegationStep('finalizing')

      await apiService.updatePaymentSession({
        payment_id: paymentId,
        status: 'paid',
        tx_hash: resultingTxHash,
      })

      setTxHash(resultingTxHash)
      await refreshUserData()
      await fetchSession(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update payment session'
      setError(message)
    } finally {
      setIsProcessingPayment(false)
      setDelegationStep(null)
    }
  }

  const handleManualRefresh = () => {
    fetchSession(true)
  }

  const copyTransactionHash = async () => {
    if (!txHash) return
    await navigator.clipboard.writeText(txHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openTransactionExplorer = () => {
    if (!txHash) return
    window.open(`https://testnet.monadexplorer.com/tx/${txHash}`, '_blank')
  }

  const countdown = useMemo(() => formatDuration(secondsRemaining), [secondsRemaining])

  const renderStatusIcon = () => {
    switch (session?.status) {
      case 'paid':
        return <CheckCircle2 className="w-6 h-6" />
      case 'processing':
        return <Shield className="w-6 h-6" />
      case 'expired':
        return <AlertTriangle className="w-6 h-6" />
      default:
        return <Clock className="w-6 h-6" />
    }
  }

  if (!paymentId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f0f0' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white px-10 py-12 text-center"
          style={{ border: '4px solid #000000', boxShadow: '12px 12px 0px #000000, 24px 24px 0px #e0e0e0' }}
        >
          <h2 className="text-3xl font-black text-black mb-2">Payment ID missing</h2>
          <p className="text-gray-700 font-semibold">Please open this page from a valid Autiv checkout link.</p>
        </motion.div>
      </div>
    )
  }

  if (error && !session && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f0f0' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white px-10 py-12 text-center space-y-4"
          style={{ border: '4px solid #000000', boxShadow: '12px 12px 0px #000000, 24px 24px 0px #e0e0e0' }}
        >
          <h2 className="text-3xl font-black text-black">Unable to load payment session</h2>
          <p className="text-gray-700 font-semibold">{error}</p>
          <button
            onClick={() => fetchSession(true)}
            className="retro-button px-6 py-3 font-black text-lg"
            style={{ backgroundColor: '#feca57' }}
          >
            Retry
          </button>
        </motion.div>
      </div>
    )
  }

  if (isLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f0f0' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white px-10 py-12 text-center"
          style={{ border: '4px solid #000000', boxShadow: '12px 12px 0px #000000, 24px 24px 0px #e0e0e0' }}
        >
          <div className="flex items-center justify-center mb-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              className="w-10 h-10 border-4 border-black border-t-transparent rounded-full"
            />
          </div>
          <h2 className="text-3xl font-black text-black">Preparing payment window...</h2>
          <p className="mt-4 text-gray-700 font-semibold">Loading secure checkout experience</p>
        </motion.div>
      </div>
    )
  }

  const currentStatus = statusStyles[session.status]
  const actionLoading = isProcessingPayment || smartAccountLoading || contractLoading || delegationLoading
  const smartAccountReady = authenticated ? Boolean(smartAccountResult?.smartAccount) : true

  const combinedError = error || smartAccountError || contractError || delegationError

  const getActionLabel = () => {
    if (session.status === 'paid') return 'Payment Complete'
    if (session.status === 'expired') return 'Session Expired'
    if (!authenticated) return 'Login to Continue'
    if (!smartAccountReady) return 'Preparing Smart Account...'
    if (delegationStep === 'creating') return 'Creating Delegation...'
    if (delegationStep === 'signing') return 'Signing Delegation...'
    if (delegationStep === 'subscribing') return 'Submitting Payment...'
    if (delegationStep === 'finalizing') return 'Finalizing...'
    if (actionLoading) return 'Processing...'
    return 'Pay Now'
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 md:p-10" style={{ backgroundColor: '#f0f0f0' }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl bg-white"
        style={{ border: '5px solid #000000', boxShadow: '14px 14px 0px #000000, 28px 28px 0px #e0e0e0' }}
      >
        {/* Status banner */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b-4 border-black"
          style={{ backgroundColor: currentStatus.background, color: currentStatus.text, borderColor: currentStatus.border }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-white" style={{ border: '3px solid #000000' }}>
              {renderStatusIcon()}
            </div>
            <div>
              <p className="text-xl md:text-2xl font-black">{currentStatus.label}</p>
              <p className="text-sm md:text-base font-semibold">Payment ID #{session.paymentId}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 font-bold text-base">
            <Clock className="w-5 h-5" />
            <span>Expires in {countdown}</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 md:p-8 space-y-7">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-black uppercase tracking-wide"
            style={{ color: '#000000' }}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Plan Summary */}
            <div
              className="lg:col-span-2 p-6 space-y-5"
              style={{ border: '4px solid #000000', boxShadow: '8px 8px 0px #000000', backgroundColor: '#ffffff' }}
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 flex items-center justify-center" style={{ backgroundColor: '#836EF9', border: '3px solid #000000' }}>
                  <CreditCard className="w-8 h-8 text-black" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-black text-black">{session.companyName}</h1>
                  <p className="text-lg md:text-xl font-semibold text-gray-800">{session.planName}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-baseline gap-4">
                <p className="text-5xl font-black text-black">{session.amount}</p>
                <p className="text-3xl font-black text-black">{session.tokenSymbol}</p>
                <span className="text-lg font-bold text-gray-700">{session.billingInterval}</span>
              </div>

              <div className="space-y-2 text-sm font-semibold text-gray-700">
                <p>• Automatic renewals authorized via delegation</p>
                <p>• Cancel anytime from your subscription dashboard</p>
                <p>• Session expires in <span className="font-black">{countdown}</span></p>
              </div>

              {session.features.length > 0 && (
                <div className="space-y-3">
                  {session.features.map(feature => (
                    <div
                      key={feature}
                      className="flex items-center gap-3 p-3"
                      style={{ border: '3px solid #000000', backgroundColor: '#f8f9fa', boxShadow: '4px 4px 0px #000000' }}
                    >
                      <CheckCircle2 className="w-5 h-5 text-black" />
                      <span className="font-semibold text-gray-800">{feature}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 space-y-4">
                <button
                  onClick={authenticated ? handleRealPayment : login}
                  disabled={session.status === 'paid' || session.status === 'expired' || actionLoading || !smartAccountReady}
                  className="retro-button w-full py-4 font-black text-lg"
                  style={{
                    backgroundColor: session.status === 'paid'
                      ? '#4ecdc4'
                      : authenticated
                        ? '#feca57'
                        : '#836EF9',
                    opacity: session.status === 'expired' || !smartAccountReady ? 0.6 : 1,
                    cursor: session.status === 'expired' || !smartAccountReady ? 'not-allowed' : 'pointer'
                  }}
                >
                  {getActionLabel()}
                </button>

                {session.status === 'paid' && (
                  <div
                    className="p-4 flex items-center gap-3"
                    style={{ backgroundColor: '#e6fffb', border: '3px solid #000000' }}
                  >
                    <CheckCircle2 className="w-5 h-5 text-black" />
                    <div>
                      <p className="font-black text-black">Success! Subscription activated.</p>
                      <p className="text-sm font-semibold text-gray-700">You can safely close this window.</p>
                    </div>
                  </div>
                )}

                {session.status === 'expired' && (
                  <div
                    className="p-4 flex items-center gap-3"
                    style={{ backgroundColor: '#ffe6e6', border: '3px solid #000000' }}
                  >
                    <AlertTriangle className="w-5 h-5 text-black" />
                    <div>
                      <p className="font-black text-black">Session expired.</p>
                      <p className="text-sm font-semibold text-gray-700">Return to the demo page to request a new payment window.</p>
                    </div>
                  </div>
                )}

                {txHash && (
                  <div
                    className="p-4 space-y-3"
                    style={{ border: '3px solid #000000', backgroundColor: '#f0f9ff', boxShadow: '6px 6px 0px #000000' }}
                  >
                    <p className="text-sm font-semibold text-gray-800">Transaction Hash</p>
                    <code className="block break-all text-xs bg-white border border-black px-3 py-2">{txHash}</code>
                    <div className="flex gap-3">
                      <button
                        onClick={copyTransactionHash}
                        className="retro-button px-4 py-2 text-sm font-black"
                        style={{ backgroundColor: copied ? '#4ecdc4' : '#836EF9' }}
                      >
                        {copied ? 'Copied!' : 'Copy Hash'}
                      </button>
                      <button
                        onClick={openTransactionExplorer}
                        className="retro-button px-4 py-2 text-sm font-black"
                        style={{ backgroundColor: '#feca57' }}
                      >
                        View Explorer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Column */}
            <div className="space-y-5">
              <div
                className="p-6 space-y-4"
                style={{ border: '4px solid #000000', boxShadow: '8px 8px 0px #000000', backgroundColor: '#ffffff' }}
              >
                <h2 className="text-2xl font-black text-black">Complete Payment</h2>

                <div className="p-4" style={{ border: '3px solid #000000', backgroundColor: '#fffae6' }}>
                  <p className="text-sm font-bold text-black uppercase tracking-wide">Total Due Now</p>
                  <p className="text-3xl font-black text-black mt-1">{session.amount} {session.tokenSymbol}</p>
                </div>

                {combinedError && (
                  <div className="p-4 border-3 border-red-400" style={{ border: '3px solid #ff6b6b', backgroundColor: '#fff5f5' }}>
                    <p className="font-semibold text-red-700 text-sm">{combinedError}</p>
                    <button
                      onClick={handleManualRefresh}
                      className="mt-3 retro-button px-4 py-2 font-black text-sm"
                      style={{ backgroundColor: '#feca57' }}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              <div
                className="p-4 flex items-center gap-3"
                style={{ border: '3px solid #000000', backgroundColor: '#f8f9fa', boxShadow: '6px 6px 0px #000000' }}
              >
                <p className="font-semibold text-gray-800">All transactions are securely routed through Autiv payment infrastructure.</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default PaymentWindow
