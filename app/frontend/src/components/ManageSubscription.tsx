import { motion, AnimatePresence } from 'framer-motion'
import { User, Copy, ExternalLink, X, RefreshCw } from 'lucide-react'
import { UserSubscriptions } from './UserSubscriptions'
import { useAccount } from '../hooks/usePrivyWagmiAdapter'
import { useUserSubscriptions } from '../hooks/useUserSubscriptions'
import { useSubscriptionWebSocket } from '../hooks/useSubscriptionWebSocket'
import { useSubscriptionExpiryMonitor } from '../hooks/useSubscriptionExpiryMonitor'
import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import QRCode from 'react-qr-code'
import { apiService, type TokenMetadata } from '../services/api'
import { useSmartAccountContractWriter } from '../hooks/useSmartAccountContractWriter'
import { useSmartAccount } from '../hooks/useSmartAccount'
import { formatUnits, parseUnits } from 'viem'
import { usePrivyWagmiAdapter } from '../hooks/usePrivyWagmiAdapter'
import Toast from './Toast'

const ManageSubscription = () => {
  const { address, isConnected } = useAccount()
  const { subscriptions, getUserSubscriptions, isLoading, error } = useUserSubscriptions()
  const { smartAccountResult } = useSmartAccount()
  const { transferTokenFromSmartAccount } = useSmartAccountContractWriter()
  const { publicClient } = usePrivyWagmiAdapter()
  
  // Get authentication state from Privy
  const { user, authenticated } = usePrivy()
  const [storedSmartAccount, setStoredSmartAccount] = useState<{
    address: string;
    isDeployed: boolean;
    createdAt: string;
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [eoaCopied, setEoaCopied] = useState(false)
  const refreshTimeoutRef = useRef<number | null>(null)
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false)
  const [isDepositOpen, setIsDepositOpen] = useState(false)
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false)
  const [supportedTokens, setSupportedTokens] = useState<TokenMetadata[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [withdrawToken, setWithdrawToken] = useState<TokenMetadata | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawAddress, setWithdrawAddress] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawBalance, setWithdrawBalance] = useState<string | null>(null)
  const [isFetchingBalance, setIsFetchingBalance] = useState(false)
  const [tokenBalances, setTokenBalances] = useState<Record<string, { balanceFormatted: string | null; decimals: number | null; rawBalance: bigint | null }>>({})
  const [toastState, setToastState] = useState<{
    isVisible: boolean
    message: string
    type: 'success' | 'error'
    actionLabel?: string
    actionHref?: string
  }>(
    {
      isVisible: false,
      message: '',
      type: 'success'
    }
  )
  const [isBalanceOpen, setIsBalanceOpen] = useState(false)

  type SmartAccountParam = Parameters<typeof transferTokenFromSmartAccount>[0]['smartAccount']
  const smartAccountInstance = smartAccountResult?.smartAccount as SmartAccountParam | undefined
  const smartAccountAddress = smartAccountInstance?.address ?? storedSmartAccount?.address ?? null

  const refreshSubscriptions = useCallback(async () => {
    if (authenticated && user?.email?.address) {
      await getUserSubscriptions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user?.email?.address])

  const erc20Abi = useMemo(() => ([
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: 'balance', type: 'uint256' }]
    },
    {
      name: 'decimals',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint8' }]
    }
  ]) as const, [])

  const fetchTokenBalances = useCallback(async () => {
    if (!publicClient || !smartAccountAddress || supportedTokens.length === 0) {
      setTokenBalances({})
      return
    }

    try {
      setIsFetchingBalance(true)

      const contracts = supportedTokens.flatMap((token) => ([
        {
          address: token.token_address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf' as const,
          args: [smartAccountAddress as `0x${string}`]
        },
        {
          address: token.token_address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'decimals' as const
        }
      ]))

      const results = await publicClient.multicall({
        contracts,
        allowFailure: true
      })

      const nextBalances: Record<string, { balanceFormatted: string | null; decimals: number | null; rawBalance: bigint | null }> = {}

      for (let i = 0; i < supportedTokens.length; i += 1) {
        const token = supportedTokens[i]
        if (!token) continue
        const key = token.token_address.toLowerCase()
        const balanceResult = results[i * 2]
        const decimalsResult = results[i * 2 + 1]

        const decimalsValue = decimalsResult?.status === 'success' ? Number(decimalsResult.result) : undefined
        const resolvedDecimals = Number.isFinite(decimalsValue) ? (decimalsValue as number) : (typeof token.decimals === 'number' ? token.decimals : 18)
        const rawBalance = balanceResult?.status === 'success' ? (balanceResult.result as bigint) : null
        const balanceFormatted = rawBalance != null ? Number(formatUnits(rawBalance, resolvedDecimals)).toFixed(3) : null

        nextBalances[key] = {
          balanceFormatted,
          decimals: resolvedDecimals,
          rawBalance
        }
      }

      setTokenBalances(nextBalances)
    } catch (err) {
      console.error('Failed to fetch token balances via RPC', err)
      setTokenBalances({})
    } finally {
      setIsFetchingBalance(false)
    }
  }, [publicClient, smartAccountAddress, supportedTokens, erc20Abi])

  useEffect(() => {
    if (!isWithdrawOpen || supportedTokens.length === 0) {
      setTokenBalances({})
      setWithdrawBalance(null)
      return
    }

    void fetchTokenBalances()
  }, [isWithdrawOpen, supportedTokens.length, fetchTokenBalances])

  useEffect(() => {
    if (!withdrawToken) {
      setWithdrawBalance(null)
      return
    }

    const key = withdrawToken.token_address.toLowerCase()
    setWithdrawBalance(tokenBalances[key]?.balanceFormatted ?? null)
  }, [withdrawToken, tokenBalances])

  const subscriptionManagerAddresses = useMemo(
    () => subscriptions.map((sub) => sub.subscriptionManagerAddress).filter((addr): addr is string => Boolean(addr)),
    [subscriptions]
  )

  // WebSocket connection for real-time updates
  useSubscriptionWebSocket(
    smartAccountInstance?.address || storedSmartAccount?.address || address,
    {
      onPaymentProcessed: () => {
        if (refreshTimeoutRef.current) {
          window.clearTimeout(refreshTimeoutRef.current)
        }
        refreshTimeoutRef.current = window.setTimeout(() => {
          refreshSubscriptions()
          refreshTimeoutRef.current = null
        }, 5000)
      },
      onSubscriptionCreated: () => {
        refreshSubscriptions()
      },
      onSubscriptionCancelled: () => {
      },
    },
    subscriptionManagerAddresses
  )

  useSubscriptionExpiryMonitor(subscriptions, () => {
    refreshSubscriptions()
  })


  // Load smart account from localStorage
  useEffect(() => {
    if (address && isConnected) {
      const storedSmartAccount = localStorage.getItem('autiv.smartAccount')
      if (storedSmartAccount) {
        try {
          const parsed = JSON.parse(storedSmartAccount)
          setStoredSmartAccount(parsed)
          console.log('Loaded smart account', parsed.address)
        } catch (error) {
          console.error('Failed to parse stored smart account:', error)
        }
      }
    }
  }, [address, isConnected])

  useEffect(() => {
    if (smartAccountResult?.smartAccount) {
      setStoredSmartAccount((previous) => {
        const currentAddress = smartAccountResult.smartAccount.address
        if (previous?.address === currentAddress && previous?.isDeployed === smartAccountResult.isDeployed) {
          return previous
        }

        return {
          address: currentAddress,
          isDeployed: smartAccountResult.isDeployed,
          createdAt: previous?.createdAt ?? new Date().toISOString()
        }
      })
    }
  }, [smartAccountResult])

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  const copySmartAccountAddress = async () => {
    if (storedSmartAccount?.address) {
      await navigator.clipboard.writeText(storedSmartAccount.address)
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
    if (storedSmartAccount?.address) {
      window.open(`https://testnet.monadexplorer.com/address/${storedSmartAccount.address}`, '_blank')
    }
  }

  const loadSupportedTokens = useCallback(async () => {
    if (isLoadingTokens) return

    try {
      setIsLoadingTokens(true)
      const response = await apiService.getSupportedTokens()
      if (response.success && response.data?.tokens) {
        setSupportedTokens(response.data.tokens)
        if (response.success && response.data?.tokens && response.data.tokens.length > 0) {
          await fetchTokenBalances()
        }
      }
    } catch (tokenError) {
      console.error('Failed to load supported tokens', tokenError)
    } finally {
      setIsLoadingTokens(false)
    }
  }, [isLoadingTokens, fetchTokenBalances])

  useEffect(() => {
    if (isWithdrawOpen) {
      if (supportedTokens.length === 0) {
        loadSupportedTokens()
      } else {
        void fetchTokenBalances()
      }
    }
  }, [isWithdrawOpen, supportedTokens.length, loadSupportedTokens, fetchTokenBalances])

  useEffect(() => {
    if (isBalanceOpen) {
      if (supportedTokens.length === 0) {
        loadSupportedTokens()
      } else {
        void fetchTokenBalances()
      }
    }
  }, [isBalanceOpen, supportedTokens.length, loadSupportedTokens, fetchTokenBalances])

  const closeWithdrawModal = () => {
    setIsWithdrawOpen(false)
    setIsTokenDropdownOpen(false)
    setWithdrawToken(null)
    setWithdrawAmount('')
    setWithdrawAddress('')
    setWithdrawError(null)
    setWithdrawBalance(null)
    setIsFetchingBalance(false)
    setTokenBalances({})
  }

  const handleWithdraw = async () => {
    if (!withdrawToken || !withdrawAmount || !withdrawAddress) {
      setWithdrawError('All fields are required')
      return
    }

    const parsedAmount = Number(withdrawAmount)
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setWithdrawError('Enter a valid amount')
      return
    }

    try {
      setIsWithdrawing(true)
      setWithdrawError(null)
      if (!smartAccountInstance) {
        throw new Error('Smart Account not available')
      }

      const tokenInfo = tokenBalances[withdrawToken.token_address.toLowerCase()]
      const decimals = typeof tokenInfo?.decimals === 'number' ? tokenInfo.decimals : (withdrawToken.decimals ?? 18)

      const amountInUnits = parseUnits(withdrawAmount, decimals)
      if (tokenInfo?.rawBalance != null && amountInUnits > tokenInfo.rawBalance) {
        setWithdrawError('Amount exceeds available balance')
        return
      }

      const txHash = await transferTokenFromSmartAccount({
        smartAccount: smartAccountInstance,
        tokenAddress: withdrawToken.token_address as `0x${string}`,
        recipient: withdrawAddress as `0x${string}`,
        amount: parsedAmount,
        decimals
      })
      closeWithdrawModal()
      setToastState({
        isVisible: true,
        message: 'Withdrawal successful.',
        type: 'success',
        actionLabel: 'View on explorer',
        actionHref: `https://testnet.monadexplorer.com/tx/${txHash}`
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send token'
      setWithdrawError(message)
      setToastState({
        isVisible: true,
        message,
        type: 'error'
      })
    } finally {
      setIsWithdrawing(false)
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
      <Toast
        isVisible={toastState.isVisible}
        message={toastState.message}
        type={toastState.type}
        actionLabel={toastState.actionLabel}
        actionHref={toastState.actionHref}
        onClose={() => setToastState({ isVisible: false, message: '', type: 'success' })}
      />
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
            {storedSmartAccount ? (
              <div className="flex items-center gap-3">
                <div
                  className="flex-1 p-4 font-mono text-sm break-all bg-white"
                  style={{
                    border: '3px solid #000000',
                    boxShadow: '4px 4px 0px #000000'
                  }}
                >
                  {storedSmartAccount.address}
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
          {smartAccountAddress && (
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
                onClick={() => setIsDepositOpen(true)}
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
                onClick={() => setIsWithdrawOpen(true)}
                disabled={!smartAccountInstance}
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
                onClick={() => setIsBalanceOpen(true)}
                disabled={!smartAccountInstance}
              >
                View Balance
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {isDepositOpen && smartAccountAddress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setIsDepositOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white max-w-md w-full border-4 border-black"
              style={{ boxShadow: '8px 8px 0px #000000, 16px 16px 0px #f8f8f8' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b-4 border-black" style={{ backgroundColor: '#4ecdc4' }}>
                <h2 className="text-2xl font-black text-black">Deposit to Smart Account</h2>
                <button
                  onClick={() => setIsDepositOpen(false)}
                  className="w-10 h-10 flex items-center justify-center bg-white hover:bg-gray-100 transition-colors"
                  style={{ border: '2px solid #000000' }}
                >
                  <X className="w-5 h-5 text-black" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2 text-center">
                  <p className="text-sm font-bold text-gray-700 uppercase">Smart Account Address</p>
                  <code
                    className="block p-4 font-mono text-sm break-all bg-white"
                    style={{ border: '3px solid #000000', boxShadow: '4px 4px 0px #000000' }}
                  >
                    {smartAccountAddress}
                  </code>
                  <button
                    onClick={copySmartAccountAddress}
                    className="retro-button px-4 py-2 font-black text-sm"
                    style={{ backgroundColor: '#feca57' }}
                  >
                    {copied ? 'Copied!' : 'Copy Address'}
                  </button>
                </div>
                <div className="flex justify-center">
                  <div className="p-4 bg-white" style={{ border: '3px solid #000000', boxShadow: '4px 4px 0px #000000' }}>
                    <QRCode value={smartAccountAddress} size={180} fgColor="#000000" bgColor="#ffffff" />
                  </div>
                </div>
                <p className="text-sm text-gray-700 font-medium text-center">
                  Send tokens to this address. Balances will be available for your subscription payments.
                </p>
                <button
                  onClick={() => setIsDepositOpen(false)}
                  className="retro-button w-full py-3 font-black text-lg"
                  style={{ backgroundColor: '#ff6b6b' }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBalanceOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setIsBalanceOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white max-w-lg w-full border-4 border-black"
              style={{ boxShadow: '8px 8px 0px #000000, 16px 16px 0px #f8f8f8' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b-4 border-black" style={{ backgroundColor: '#836EF9' }}>
                <h2 className="text-2xl font-black text-black">Smart Account Balances</h2>
                <button
                  onClick={() => setIsBalanceOpen(false)}
                  className="w-10 h-10 flex items-center justify-center bg-white hover:bg-gray-100 transition-colors"
                  style={{ border: '2px solid #000000' }}
                >
                  <X className="w-5 h-5 text-black" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                    Address: <span className="font-mono font-black text-black">{smartAccountAddress}</span>
                  </p>
                  <button
                    onClick={() => {
                      void fetchTokenBalances()
                    }}
                    className="w-10 h-10 flex items-center justify-center bg-white"
                    style={{ border: '3px solid #000000', boxShadow: '3px 3px 0px #000000' }}
                  >
                    <RefreshCw className={`w-5 h-5 ${isLoadingTokens ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="space-y-3">
                  {supportedTokens.map((token) => {
                    const key = token.token_address.toLowerCase()
                    const tokenInfo = tokenBalances[key]
                    const balanceText = tokenInfo?.balanceFormatted ?? '--'

                    return (
                      <div
                        key={token.id}
                        className="flex items-center justify-between px-4 py-3"
                        style={{ border: '3px solid #000000', boxShadow: '4px 4px 0px #000000', backgroundColor: '#ffffff' }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 flex items-center justify-center rounded-full border border-black bg-white overflow-hidden">
                            {token.image_url ? (
                              <img src={token.image_url} alt={`${token.name} logo`} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-sm font-black">{token.symbol.slice(0, 2).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <div className="text-lg font-black text-black">{token.name}</div>
                            <div className="text-sm font-medium text-gray-700">{token.symbol}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-black text-black">{balanceText}</div>
                          <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">Available</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button
                  onClick={() => setIsBalanceOpen(false)}
                  className="retro-button w-full py-3 font-black text-lg"
                  style={{ backgroundColor: '#ff6b6b' }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isWithdrawOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={closeWithdrawModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white max-w-lg w-full border-4 border-black"
              style={{ boxShadow: '8px 8px 0px #000000, 16px 16px 0px #f8f8f8' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b-4 border-black" style={{ backgroundColor: '#feca57' }}>
                <h2 className="text-2xl font-black text-black">Withdraw Tokens</h2>
                <button
                  onClick={closeWithdrawModal}
                  className="w-10 h-10 flex items-center justify-center bg-white hover:bg-gray-100 transition-colors"
                  style={{ border: '2px solid #000000' }}
                >
                  <X className="w-5 h-5 text-black" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-black text-black uppercase tracking-wide">Destination Address</label>
                  <input
                    value={withdrawAddress}
                    onChange={(event) => setWithdrawAddress(event.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3 font-medium text-sm"
                    style={{ border: '3px solid #000000', boxShadow: '4px 4px 0px #000000' }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-black text-black uppercase tracking-wide">Token</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsTokenDropdownOpen((prev) => !prev)}
                      disabled={isLoadingTokens}
                      className="w-full px-4 py-3 font-medium flex items-center justify-between"
                      style={{ border: '3px solid #000000', boxShadow: '4px 4px 0px #000000', backgroundColor: '#ffffff' }}
                    >
                      <span>
                        {withdrawToken
                          ? `${withdrawToken.name} (${withdrawToken.symbol})`
                          : isLoadingTokens
                            ? 'Loading tokens...'
                            : 'Select a token'}
                      </span>
                      <span className="text-xl">▾</span>
                    </button>
                    {isTokenDropdownOpen && (
                      <div
                        className="absolute z-30 mt-2 w-full bg-white border-4 border-black max-h-64 overflow-y-auto"
                        style={{ boxShadow: '4px 4px 0px #000000' }}
                      >
                        {supportedTokens.map((token) => (
                          <button
                            key={token.id}
                            type="button"
                            onClick={() => {
                              setWithdrawToken(token)
                              setIsTokenDropdownOpen(false)
                            }}
                            className={`w-full px-4 py-3 text-left font-medium flex items-center gap-3 ${
                              withdrawToken?.id === token.id ? 'bg-gray-100' : 'hover:bg-gray-100'
                            }`}
                          >
                            <div className="w-10 h-10 flex items-center justify-center rounded-full border border-black bg-white overflow-hidden">
                              {token.image_url ? (
                                <img
                                  src={token.image_url}
                                  alt={`${token.name} logo`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-sm font-bold">
                                  {token.symbol.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="text-lg font-bold text-black">{token.name}</div>
                              <div className="text-sm font-medium text-gray-700">{token.symbol}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center justify-between text-sm font-black text-black uppercase tracking-wide">
                    <span>Amount</span>
                    {withdrawToken && smartAccountAddress && (
                      <span className="text-xs font-semibold text-gray-700">
                        Balance: {isFetchingBalance ? '...' : withdrawBalance ?? '--'}
                      </span>
                    )}
                  </label>
                  <input
                    value={withdrawAmount}
                    onChange={(event) => setWithdrawAmount(event.target.value)}
                    placeholder="0.0"
                    className="w-full px-4 py-3 font-medium text-sm"
                    style={{ border: '3px solid #000000', boxShadow: '4px 4px 0px #000000' }}
                  />
                </div>
                {withdrawError && (
                  <div className="p-3 bg-red-100 border-2 border-red-300 text-sm font-semibold text-red-800">
                    {withdrawError}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={closeWithdrawModal}
                    className="retro-button flex-1 py-3 font-black text-lg"
                    style={{ backgroundColor: '#e0e0e0' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleWithdraw}
                    disabled={isWithdrawing}
                    className={`retro-button flex-1 py-3 font-black text-lg ${isWithdrawing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ backgroundColor: '#836EF9' }}
                  >
                    {isWithdrawing ? 'Sending...' : 'Send Token'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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