import { useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, CreditCard, ExternalLink, X, Zap, Crown, Rocket } from 'lucide-react'
import type { UserSubscription } from '../types/subscription'
import { useSmartAccountContractWriter } from '../hooks/useSmartAccountContractWriter'
import { useSmartAccount } from '../hooks/useSmartAccount'

// Define a proper type for the smart account
interface SmartAccount {
  address: `0x${string}`
  isDeployed: () => Promise<boolean>
  getDeployed: () => Promise<boolean>
  [key: string]: unknown
}
// Automatic renewal is handled by the contract itself using MetaMask delegation

interface UserSubscriptionsProps {
  subscriptions: UserSubscription[]
  isLoading: boolean
  error: string | null
  onCancelSubscription?: (subscriptionId: string) => void
  onRefresh?: () => void
}

export const UserSubscriptions: React.FC<UserSubscriptionsProps> = ({ 
  subscriptions, 
  isLoading, 
  error, 
  onCancelSubscription,
  onRefresh
  }) => {
    const { cancelSubscriptionWithSmartAccount, isLoading: isCancellingSa } = useSmartAccountContractWriter()
    const { createSmartAccount, smartAccountResult } = useSmartAccount()
    // refreshUserData removed - WebSocket handles automatic refresh
    const [cancellingId, setCancellingId] = useState<string | null>(null)

  const handleCancelSubscription = async (subscriptionToCancel: UserSubscription) => {
    const subscriptionId = subscriptionToCancel.id
    setCancellingId(subscriptionId)
    try {
      // Prefer cancelling via Smart Account (bundler + paymaster)
      let sa: SmartAccount | null = smartAccountResult?.smartAccount as SmartAccount | null
      if (!sa) {
        const created = await createSmartAccount()
        if (!created) {
          throw new Error('Failed to create smart account')
        }
        sa = created.smartAccount as SmartAccount
      }

      // Cancel subscription (delegation disabling is now handled inside cancelSubscriptionWithSmartAccount)
      const tokenAddress = subscriptionToCancel.tokenAddress as `0x${string}` | undefined
      const subscriptionManagerAddress = subscriptionToCancel.subscriptionManagerAddress as `0x${string}` | undefined

      if (!tokenAddress || !subscriptionManagerAddress) {
        throw new Error('Subscription is missing token or manager address')
      }

      await cancelSubscriptionWithSmartAccount(
        sa,
        tokenAddress,
        subscriptionManagerAddress,
        subscriptionToCancel.planId
      )
      console.log('Subscription cancelled with Smart Account')
      
      // Refresh data after database has been updated
      if (onRefresh) onRefresh()
      if (onCancelSubscription) onCancelSubscription(subscriptionId)
    } catch (err) {
      console.error('Smart Account cancellation failed:', err)
    } finally {
      setCancellingId(null)
    }
  }

  const getStatusStyle = (status: UserSubscription['status'], isPending: boolean) => {
    if (status === 'active' && isPending) {
      return { backgroundColor: '#feca57', border: '2px solid #000000', color: '#000000' }
    }

    switch (status) {
      case 'active':
        return { backgroundColor: '#96ceb4', border: '2px solid #000000', color: '#000000' }
      case 'expired':
        return { backgroundColor: '#ff6b6b', border: '2px solid #000000', color: '#ffffff' }
      case 'cancelled':
        return { backgroundColor: '#e0e0e0', border: '2px solid #000000', color: '#000000' }
      default:
        return { backgroundColor: '#e0e0e0', border: '2px solid #000000', color: '#000000' }
    }
  }

  const getPlanIcon = (planName: string) => {
    if (planName.toLowerCase().includes('basic')) return <Zap className="w-6 h-6 text-black" />
    if (planName.toLowerCase().includes('pro')) return <Crown className="w-6 h-6 text-black" />
    if (planName.toLowerCase().includes('enterprise')) return <Rocket className="w-6 h-6 text-black" />
    return <CreditCard className="w-6 h-6 text-black" />
  }

  const getPlanColor = (planName: string) => {
    if (planName.toLowerCase().includes('basic')) return '#4ecdc4'
    if (planName.toLowerCase().includes('pro')) return '#feca57'
    if (planName.toLowerCase().includes('enterprise')) return '#836EF9'
    return '#45b7d1'
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const isExpired = (endDate: Date) => {
    return new Date() > endDate
  }

  const getTimeRemaining = (endDate: Date) => {
    const now = new Date()
    const diffTime = endDate.getTime() - now.getTime()
    
    if (diffTime <= 0) return "Expired"
    
    const diffMinutes = Math.floor(diffTime / (1000 * 60))
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60))
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} remaining`
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} remaining`
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} remaining`
    } else {
      const diffSeconds = Math.floor(diffTime / 1000)
      return `${diffSeconds} second${diffSeconds > 1 ? 's' : ''} remaining`
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="flex items-center justify-center mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-8 h-8 border-2 border-black border-t-transparent rounded-full"
          />
        </div>
        <h3 className="text-3xl font-black text-black mb-4">Loading Subscriptions...</h3>
        <p className="text-xl text-gray-800 font-medium">
          Hold tight!
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div
          className="w-24 h-24 flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: '#ff6b6b', border: '3px solid #000000' }}
        >
          <X className="w-12 h-12 text-black" />
        </div>
        <h3 className="text-3xl font-black text-black mb-4">Error Loading Subscriptions</h3>
        <p className="text-xl text-gray-800 font-medium mb-8">
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="retro-button px-8 py-4 font-black text-xl"
          style={{ backgroundColor: '#ff6b6b' }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (subscriptions.length === 0) {
    return (
      <div className="text-center py-12">
        <div
          className="w-24 h-24 flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: '#ff6b6b', border: '3px solid #000000' }}
        >
          <CreditCard className="w-12 h-12 text-black" />
        </div>
        <h3 className="text-3xl font-black text-black mb-4">No Active Subscriptions</h3>
        <p className="text-xl text-gray-800 font-medium mb-8">
          You haven't subscribed to any plans yet — let's fix that!
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/demo"
            className="retro-button px-8 py-4 font-black text-xl"
            style={{ backgroundColor: '#4ecdc4' }}
          >
            Browse Plans!
          </a>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="retro-button px-8 py-4 font-black text-xl"
              style={{ backgroundColor: '#feca57' }}
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div 
        className="flex items-center justify-between p-4 border-b-4 border-black"
        style={{ backgroundColor: '#feca57' }}
      >
        <div className="flex items-center">
          <div
            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center mr-3 md:mr-4 bg-white"
            style={{ border: '3px solid #000000', boxShadow: '4px 4px 0px #000000' }}
          >
            <CreditCard className="w-5 h-5 md:w-6 md:h-6 text-black" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-black">Your Subscriptions</h2>
        </div>
      </div>
      
      {/* Scrollable Container - Fixed height when more than 2 subscriptions */}
      <div 
        className="p-4 md:p-8"
      >
        <div 
          className={`${subscriptions.length > 2 ? 'subscription-scroll' : ''}`}
          style={{
            height: subscriptions.length > 2 ? '500px' : 'auto', // Fixed height to show ~2.5 cards and force scroll
            overflowY: subscriptions.length > 2 ? 'scroll' : 'visible',
            paddingRight: subscriptions.length > 2 ? '12px' : '0'
          }}
        >
        <div className="space-y-4 md:space-y-6">
        {subscriptions.map((subscription, index) => {
        const expired = isExpired(subscription.endDate)
        const timeRemaining = getTimeRemaining(subscription.endDate)
        const actualStatus = expired && subscription.status === 'active' && !subscription.isCancellationPending ? 'expired' : subscription.status

        return (
          <motion.div
            key={subscription.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white p-4 md:p-6"
            style={{ boxShadow: '8px 8px 0px #e0e0e0', border: '3px solid #000000' }}
          >
            <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-4 md:mb-6 space-y-4 md:space-y-0">
              <div className="flex items-center">
                <div
                  className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center mr-3 md:mr-4"
                  style={{ backgroundColor: getPlanColor(subscription.planName), border: '3px solid #000000' }}
                >
                  {getPlanIcon(subscription.planName)}
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-black text-black">{subscription.companyName} - {subscription.planName}</h3>
                  <div className="flex flex-col md:flex-row md:items-center mt-2 space-y-2 md:space-y-0">
                    <span 
                      className="px-3 py-1 text-sm font-black w-fit"
                      style={getStatusStyle(actualStatus, subscription.isCancellationPending)}
                    >
                      {subscription.isCancellationPending && actualStatus !== 'active'
                        ? 'Cancelling'
                        : actualStatus.charAt(0).toUpperCase() + actualStatus.slice(1)}
                    </span>
                    {subscription.isCancellationPending && subscription.cancellationEffectiveAt && (
                      <span className="md:ml-3 text-base md:text-lg font-bold text-gray-800">
                        Renewal ends {subscription.cancellationEffectiveAt.toLocaleString()}
                      </span>
                    )}
                    {actualStatus === 'active' && (
                      <span className="md:ml-3 text-base md:text-lg font-bold text-gray-800">
                        {timeRemaining}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="text-left md:text-right">
                <div className="text-2xl md:text-3xl font-black text-black">
                  {subscription.price} {subscription.tokenSymbol || 'USDC'}
                </div>
                {(subscription.status === 'active' && !subscription.isCancellationPending) || subscription.status === 'expired' ? (
                  <button
                    onClick={() => handleCancelSubscription(subscription)}
                    disabled={isCancellingSa || cancellingId === subscription.id}
                    className="mt-3 retro-button px-4 py-2 font-black text-sm disabled:opacity-50"
                    style={{ backgroundColor: '#ff6b6b' }}
                  >
                    {cancellingId === subscription.id ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-4 h-4 border-2 border-black border-t-transparent rounded-full mr-1 inline"
                        />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 mr-1 inline" />
                        Cancel
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <div 
                className="p-3 md:p-4"
                style={{
                  backgroundColor: '#f8f9fa',
                  border: '2px solid #000000',
                  boxShadow: '2px 2px 0px #000000'
                }}
              >
                <div className="flex items-center mb-2">
                  <Calendar className="w-4 h-4 md:w-5 md:h-5 mr-2 text-black" />
                  <span className="font-black text-black text-sm md:text-base">Start Date</span>
                </div>
                <div className="font-bold text-gray-800 text-sm md:text-base">{formatDate(subscription.startDate)}</div>
              </div>
              
              <div 
                className="p-3 md:p-4"
                style={{
                  backgroundColor: '#f8f9fa',
                  border: '2px solid #000000',
                  boxShadow: '2px 2px 0px #000000'
                }}
              >
                <div className="flex items-center mb-2">
                  <Calendar className="w-4 h-4 md:w-5 md:h-5 mr-2 text-black" />
                  <span className="font-black text-black text-sm md:text-base">End Date</span>
                </div>
                <div className="font-bold text-gray-800 text-sm md:text-base">{formatDate(subscription.endDate)}</div>
              </div>
              
              {subscription.txHash && (
                <div 
                  className="p-3 md:p-4"
                  style={{
                    backgroundColor: '#f8f9fa',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                  }}
                >
                  <div className="flex items-center mb-2">
                    <ExternalLink className="w-4 h-4 md:w-5 md:h-5 mr-2 text-black" />
                    <span className="font-black text-black text-sm md:text-base">Transaction</span>
                  </div>
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${subscription.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-blue-600 hover:text-blue-800 break-all text-xs md:text-sm"
                  >
                    {subscription.txHash.slice(0, 12)}...
                  </a>
                </div>
              )}
            </div>

            {actualStatus === 'expired' && (
              <div 
                className="mt-6 p-4"
                style={{
                  backgroundColor: '#fff3cd',
                  border: '3px solid #000000',
                  boxShadow: '3px 3px 0px #000000'
                }}
              >
                <p className="text-black font-bold mb-3">
                  Your subscription has expired. The contract will automatically charge you when payment is due!
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => window.location.reload()}
                    className="retro-button px-6 py-3 font-black"
                    style={{ backgroundColor: '#feca57' }}
                  >
                    Refresh Status
                  </button>
                </div>
                
              </div>
            )}
          </motion.div>
        )
        })}
        </div>
        </div>
      </div>
    </div>
  )
}