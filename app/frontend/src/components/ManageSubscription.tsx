import { motion } from 'framer-motion'
import { User, Copy, ExternalLink } from 'lucide-react'
import { UserSubscriptions } from './UserSubscriptions'
import { useAccount } from '../hooks/usePrivyWagmiAdapter'
import { useUserSubscriptions } from '../hooks/useUserSubscriptions'
import { useSubscriptionWebSocket } from '../hooks/useSubscriptionWebSocket'
import { useSubscriptionExpiryMonitor } from '../hooks/useSubscriptionExpiryMonitor'
import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'

const ManageSubscription = () => {
  const { address, isConnected } = useAccount()
  const { subscriptions, getUserSubscriptions, isLoading, error } = useUserSubscriptions()
  
  // Get authentication state from Privy
  const { user, authenticated } = usePrivy()
  const [smartAccount, setSmartAccount] = useState<{
    address: string;
    isDeployed: boolean;
    createdAt: string;
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [eoaCopied, setEoaCopied] = useState(false)
  const refreshTimeoutRef = useRef<number | null>(null)

  const refreshSubscriptions = useCallback(async () => {
    if (authenticated && user?.email?.address) {
      console.log('Refreshing subscriptions for user:', user.email.address)
      await getUserSubscriptions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user?.email?.address])

  const subscriptionManagerAddresses = useMemo(
    () => subscriptions.map((sub) => sub.subscriptionManagerAddress).filter((addr): addr is string => Boolean(addr)),
    [subscriptions]
  )

  // WebSocket connection for real-time updates
  useSubscriptionWebSocket(
    smartAccount?.address || address,
    {
      onPaymentProcessed: (user, amount, timestamp) => {
        console.log('Payment processed event received:', { user, amount, timestamp })
        if (refreshTimeoutRef.current) {
          window.clearTimeout(refreshTimeoutRef.current)
        }
        refreshTimeoutRef.current = window.setTimeout(() => {
          refreshSubscriptions()
          refreshTimeoutRef.current = null
        }, 5000)
      },
      onSubscriptionCreated: (user, planId) => {
        console.log('Subscription created event received:', { user, planId })
        refreshSubscriptions()
      },
      onSubscriptionCancelled: (user) => {
        console.log('Subscription cancelled event received:', { user })
      },
    },
    subscriptionManagerAddresses
  )

  useSubscriptionExpiryMonitor(subscriptions, () => {
    console.log('Subscription expired - refreshing data...')
    refreshSubscriptions()
  })

  // Subscriptions are automatically loaded by AuthContext and provided via useUserSubscriptions
  // No need to manually call getUserSubscriptions() on mount

  // Load smart account from localStorage
  useEffect(() => {
    if (address && isConnected) {
      const storedSmartAccount = localStorage.getItem('autiv.smartAccount')
      if (storedSmartAccount) {
        try {
          const parsed = JSON.parse(storedSmartAccount)
          setSmartAccount(parsed)
          console.log('Loaded smart account from localStorage:', parsed.address)
        } catch (error) {
          console.error('Failed to parse stored smart account:', error)
        }
      }
    }
  }, [address, isConnected])

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  const copySmartAccountAddress = async () => {
    if (smartAccount?.address) {
      await navigator.clipboard.writeText(smartAccount.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copyEoaAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address)
      setEoaCopied(true)
      setTimeout(() => setEoaCopied(false), 2000)
    }
  }

  const openSmartAccountExplorer = () => {
    if (smartAccount?.address) {
      window.open(`https://testnet.monadexplorer.com/address/${smartAccount.address}`, '_blank')
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border-4 border-black p-12"
          style={{ boxShadow: '8px 8px 0px #000000, 16px 16px 0px #f8f8f8' }}
        >
          <div
            className="w-24 h-24 flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: '#ff6b6b', border: '3px solid #000000' }}
          >
            <User className="w-12 h-12 text-black" />
          </div>
          <h1 className="text-5xl font-black text-black mb-4">
            Manage Subscriptions
          </h1>
          <p className="text-xl text-gray-800 font-medium mb-8">
            Please login to manage your subscriptions
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-black mb-4">
          <span className="gradient-text">Manage Subscriptions</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-800 font-medium">
          View and manage your active subscriptions with <span className="font-black" style={{ color: '#836EF9' }}>Autiv</span>
        </p>
      </motion.div>

      {/* Account Info - Enhanced Neobrutalism Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white"
        style={{ 
          border: '4px solid #000000',
          boxShadow: '8px 8px 0px #000000'
        }}
      >
        {/* Header Section with Colored Background */}
        <div 
          className="p-4 border-b-4 border-black"
          style={{ backgroundColor: '#4ecdc4' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 flex items-center justify-center bg-white"
              style={{ border: '3px solid #000000', boxShadow: '4px 4px 0px #000000' }}
            >
              <User className="w-7 h-7 text-black" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-black text-black">Account Information</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold text-black opacity-70">EOA:</span>
                <code className="text-xs font-mono font-bold text-black">
                  {address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Not connected'}
                </code>
                {address && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={copyEoaAddress}
                    className="p-1.5 bg-white hover:bg-gray-100 transition-colors"
                    style={{ border: '2px solid #000000' }}
                  >
                    <Copy size={10} className="text-black" />
                  </motion.button>
                )}
                {eoaCopied && <span className="text-xs font-black text-white bg-black px-2 py-0.5">Copied!</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {/* Smart Account Address Display */}
          <div className="mb-6">
            <label className="block text-sm font-black text-black mb-3 uppercase tracking-wide">
              Smart Account Address
            </label>
            {smartAccount ? (
              <div className="flex items-center gap-3">
                <div
                  className="flex-1 p-4 font-mono text-sm break-all bg-white"
                  style={{
                    border: '3px solid #000000',
                    boxShadow: '4px 4px 0px #000000'
                  }}
                >
                  {smartAccount.address}
                </div>
                <motion.button
                  whileHover={{ x: 1, y: 1, boxShadow: '2px 2px 0px #000000' }}
                  whileTap={{ x: 3, y: 3, boxShadow: 'none' }}
                  transition={{ duration: 0.1 }}
                  onClick={copySmartAccountAddress}
                  className="px-4 py-4 font-black text-xs transition-all"
                  style={{
                    border: '3px solid #000000',
                    boxShadow: '4px 4px 0px #000000',
                    backgroundColor: copied ? '#4ade80' : '#ffffff'
                  }}
                  title="Copy address"
                >
                  <Copy size={16} />
                </motion.button>
                <motion.button
                  whileHover={{ x: 1, y: 1, boxShadow: '2px 2px 0px #000000' }}
                  whileTap={{ x: 3, y: 3, boxShadow: 'none' }}
                  transition={{ duration: 0.1 }}
                  onClick={openSmartAccountExplorer}
                  className="px-4 py-4 font-black text-xs transition-all"
                  style={{
                    border: '3px solid #000000',
                    boxShadow: '4px 4px 0px #000000',
                    backgroundColor: '#ffffff'
                  }}
                  title="View on explorer"
                >
                  <ExternalLink size={16} />
                </motion.button>
              </div>
            ) : (
              <div
                className="p-6 text-sm font-bold text-gray-600 text-center bg-gray-50"
                style={{
                  border: '3px solid #000000',
                  boxShadow: '4px 4px 0px #000000'
                }}
              >
                No Smart Account Created Yet
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {smartAccount && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <motion.button
                whileHover={{ x: 1, y: 1, boxShadow: '2px 2px 0px #000000' }}
                whileTap={{ x: 3, y: 3, boxShadow: 'none' }}
                transition={{ duration: 0.1 }}
                className="px-6 py-4 font-black text-base"
                style={{ 
                  backgroundColor: '#4ecdc4',
                  border: '3px solid #000000',
                  boxShadow: '4px 4px 0px #000000'
                }}
                onClick={() => console.log('Deposit clicked')}
              >
                Deposit
              </motion.button>
              
              <motion.button
                whileHover={{ x: 1, y: 1, boxShadow: '2px 2px 0px #000000' }}
                whileTap={{ x: 3, y: 3, boxShadow: 'none' }}
                transition={{ duration: 0.1 }}
                className="px-6 py-4 font-black text-base"
                style={{ 
                  backgroundColor: '#feca57',
                  border: '3px solid #000000',
                  boxShadow: '4px 4px 0px #000000'
                }}
                onClick={() => console.log('Withdraw clicked')}
              >
                Withdraw
              </motion.button>
              
              <motion.button
                whileHover={{ x: 1, y: 1, boxShadow: '2px 2px 0px #000000' }}
                whileTap={{ x: 3, y: 3, boxShadow: 'none' }}
                transition={{ duration: 0.1 }}
                className="px-6 py-4 font-black text-base"
                style={{ 
                  backgroundColor: '#836EF9',
                  border: '3px solid #000000',
                  boxShadow: '4px 4px 0px #000000'
                }}
                onClick={() => console.log('View History clicked')}
              >
                View History
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Subscriptions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white overflow-hidden"
        style={{ boxShadow: '6px 6px 0px #000000, 12px 12px 0px #e0e0e0', border: '3px solid #000000' }}
      >
        <UserSubscriptions 
          subscriptions={subscriptions}
          isLoading={isLoading}
          error={error}
          onRefresh={refreshSubscriptions}
        />
      </motion.div>
    </div>
  )
}

export default ManageSubscription