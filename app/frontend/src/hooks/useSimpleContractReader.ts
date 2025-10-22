import { useState, useCallback, useRef } from 'react'
import { createPublicClient, http } from 'viem'
import { monadTestnet } from '../config/chains'
import { CONTRACTS } from '../contracts'
import { apiService } from '../services/api'
import { useAuth } from './useAuth'
import type { SubscriptionPlan } from '../types/subscription'

// Standard ERC20 ABI for decimals function
const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "type": "function"
  }
] as const

const CONFIG_CACHE_KEY_PREFIX = 'autiv.contractConfig'
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000
const PLANS_CACHE_KEY_PREFIX = 'autiv.contractPlans'
const PLANS_CACHE_TTL_MS = 5 * 60 * 1000

type CachedContractConfig = {
  subscriptionManagerAddress: `0x${string}`
  tokenAddress: `0x${string}`
  timestamp: number
}

const getContractConfigCacheKey = (projectId: string): string => `${CONFIG_CACHE_KEY_PREFIX}:${projectId}`
const getPlansCacheKey = (projectId: string): string => `${PLANS_CACHE_KEY_PREFIX}:${projectId}`

const readCachedContractConfig = (projectId: string): CachedContractConfig | null => {
  if (!projectId) return null

  try {
    const raw = localStorage.getItem(getContractConfigCacheKey(projectId))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachedContractConfig
    if (
      !parsed ||
      typeof parsed.timestamp !== 'number' ||
      !parsed.subscriptionManagerAddress ||
      !parsed.tokenAddress
    ) {
      localStorage.removeItem(getContractConfigCacheKey(projectId))
      return null
    }

    const isExpired = Date.now() - parsed.timestamp > CONFIG_CACHE_TTL_MS
    if (isExpired) {
      localStorage.removeItem(getContractConfigCacheKey(projectId))
      return null
    }

    return parsed
  } catch (error) {
    console.warn('Failed to parse cached contract config:', error)
    localStorage.removeItem(getContractConfigCacheKey(projectId))
    return null
  }
}

const writeCachedContractConfig = (
  projectId: string,
  config: { subscriptionManagerAddress: `0x${string}`; tokenAddress: `0x${string}` }
): void => {
  if (!projectId) return

  try {
    const payload: CachedContractConfig = {
      subscriptionManagerAddress: config.subscriptionManagerAddress,
      tokenAddress: config.tokenAddress,
      timestamp: Date.now(),
    }
    localStorage.setItem(getContractConfigCacheKey(projectId), JSON.stringify(payload))
  } catch (error) {
    console.warn('Failed to cache contract config:', error)
  }
}

const removeCachedContractConfig = (projectId: string): void => {
  if (!projectId) return
  localStorage.removeItem(getContractConfigCacheKey(projectId))
}

type CachedPlans = {
  plans: SubscriptionPlan[]
  timestamp: number
}

const readCachedPlans = (projectId: string): CachedPlans | null => {
  if (!projectId) return null

  try {
    const raw = localStorage.getItem(getPlansCacheKey(projectId))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachedPlans
    if (!parsed || typeof parsed.timestamp !== 'number' || !Array.isArray(parsed.plans)) {
      localStorage.removeItem(getPlansCacheKey(projectId))
      return null
    }

    const isExpired = Date.now() - parsed.timestamp > PLANS_CACHE_TTL_MS
    if (isExpired) {
      localStorage.removeItem(getPlansCacheKey(projectId))
      return null
    }

    return parsed
  } catch (error) {
    console.warn('Failed to parse cached plans:', error)
    localStorage.removeItem(getPlansCacheKey(projectId))
    return null
  }
}

const writeCachedPlans = (projectId: string, plans: SubscriptionPlan[]): void => {
  if (!projectId) return

  try {
    const payload: CachedPlans = {
      plans,
      timestamp: Date.now(),
    }
    localStorage.setItem(getPlansCacheKey(projectId), JSON.stringify(payload))
  } catch (error) {
    console.warn('Failed to cache plans:', error)
  }
}

const FALLBACK_DEMO_PLANS: Omit<SubscriptionPlan, 'description'>[] = [
  {
    id: '1',
    name: '1 Minute Test',
    price: 1,
    duration: 60,
    durationText: '1 minute',
    features: [
      'MetaMask Smart Account integration',
      'Automated subscription payments',
      'USDC payment support',
      'Basic support',
      'Standard features'
    ],
    tokenSymbol: 'USDC'
  },
  {
    id: '2',
    name: '2 Minutes Test',
    price: 2,
    duration: 120,
    durationText: '2 minutes',
    features: [
      'MetaMask Smart Account integration',
      'Automated subscription payments',
      'USDC payment support',
      'Basic support',
      'Standard features'
    ],
    tokenSymbol: 'USDC'
  },
  {
    id: '3',
    name: '5 Minutes Test',
    price: 5,
    duration: 300,
    durationText: '5 minutes',
    features: [
      'MetaMask Smart Account integration',
      'Automated subscription payments',
      'USDC payment support',
      'Basic support',
      'Standard features'
    ],
    tokenSymbol: 'USDC'
  }
]

export const useSimpleContractReader = (projectIdOverride?: string) => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cachedPlans, setCachedPlans] = useState<SubscriptionPlan[] | null>(null)
  const isMountedRef = useRef(true)
  const decimalsCacheRef = useRef<Record<string, number>>({})
  const contractConfigRef = useRef<{
    subscriptionManagerAddress: `0x${string}`
    tokenAddress: `0x${string}`
  } | null>(null)
  const publicClientRef = useRef(createPublicClient({
    chain: monadTestnet,
    transport: http('https://monad-testnet.drpc.org'),
  }))
  const isFetchingRef = useRef(false)

  const { authenticated, isInitialized } = useAuth()

  const getTokenDecimals = useCallback(async (tokenAddress: string): Promise<number> => {
    // Check cache first
    if (decimalsCacheRef.current[tokenAddress]) {
      return decimalsCacheRef.current[tokenAddress]
    }

    try {
      const decimals = await publicClientRef.current.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }) as number

      // Cache the result in ref
      decimalsCacheRef.current[tokenAddress] = decimals

      return decimals
           } catch (err) {
             console.error('Error getting token decimals:', err)
             // Return default 18 decimals for USDC if we can't get the real value
             return 18
           }
  }, [])

  const formatTokenAmountRef = useRef<(amount: bigint, tokenAddress: string) => Promise<string>>(async () => '0')

  const formatTokenAmount = useCallback(async (amount: bigint, tokenAddress: string): Promise<string> => {
    const decimals = await getTokenDecimals(tokenAddress)
    const divisor = BigInt(10 ** decimals)
    const wholePart = amount / divisor
    const fractionalPart = amount % divisor
    
    if (fractionalPart === 0n) {
      return wholePart.toString()
    }
    
    // Convert fractional part to decimal string
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
    const trimmedFractional = fractionalStr.replace(/0+$/, '')
    
    if (trimmedFractional === '') {
      return wholePart.toString()
    }
    
    return `${wholePart.toString()}.${trimmedFractional}`
  }, [getTokenDecimals])

  // Update the ref whenever the function changes
  formatTokenAmountRef.current = formatTokenAmount

  const resolvedProjectId = projectIdOverride ?? (import.meta.env.VITE_DEMO_PROJECT_ID || '')

  const planHasContractMetadata = useCallback((plan: SubscriptionPlan): boolean => {
    const rawContractId = (plan as unknown as { contract_plan_id?: number | string; contractPlanId?: number | string }).contract_plan_id
      ?? (plan as unknown as { contractPlanId?: number | string }).contractPlanId
    const rawProjectId = (plan as unknown as { project_id?: string; projectId?: string }).project_id
      ?? (plan as unknown as { projectId?: string }).projectId

    const hasContractId = typeof rawContractId === 'number'
      ? !Number.isNaN(rawContractId)
      : typeof rawContractId === 'string' && rawContractId.trim().length > 0

    const hasProjectId = typeof rawProjectId === 'string' && rawProjectId.trim().length > 0
    return hasContractId && hasProjectId
  }, [])

  const plansHaveContractMetadata = useCallback((plans: SubscriptionPlan[] | null | undefined): boolean => {
    if (!plans || plans.length === 0) return false
    return plans.every(planHasContractMetadata)
  }, [planHasContractMetadata])

  const ensureContractConfig = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) {
        contractConfigRef.current = null
        removeCachedContractConfig(resolvedProjectId)
      }

      if (contractConfigRef.current && !forceRefresh) {
        return contractConfigRef.current
      }


      if (!resolvedProjectId) {
        console.warn('Demo project ID is not configured')
        return null
      }

      const cachedConfig = readCachedContractConfig(resolvedProjectId)
      if (cachedConfig && !forceRefresh) {
        contractConfigRef.current = {
          subscriptionManagerAddress: cachedConfig.subscriptionManagerAddress,
          tokenAddress: cachedConfig.tokenAddress,
        }
        return contractConfigRef.current
      }

      if (!authenticated || !isInitialized) {
        return null
      }

      const response = await apiService.getProjectContractConfig(resolvedProjectId)

      if (!response.success || !response.data) {
        if (response.error === 'Authentication required') {
          return null
        }
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
      writeCachedContractConfig(resolvedProjectId, config)

      return config
    },
    [authenticated, isInitialized, resolvedProjectId]
  )

  const getAllPlans = useCallback(async () => {
    if (!isMountedRef.current) return []

    if (!authenticated || !isInitialized) {
      if (cachedPlans && cachedPlans.length > 0) {
        return cachedPlans
      }

      const cachedFromStorageWhenLoggedOut = readCachedPlans(resolvedProjectId)
      if (cachedFromStorageWhenLoggedOut) {
        const normalizedPlans: SubscriptionPlan[] = cachedFromStorageWhenLoggedOut.plans.map((plan) => ({
          ...plan,
          description: plan.description ?? ''
        }))
        setCachedPlans(normalizedPlans)
        return normalizedPlans
      }

      const fallbackPlans: SubscriptionPlan[] = FALLBACK_DEMO_PLANS.map((plan) => ({
        ...plan,
        description: ''
      }))
      setCachedPlans(fallbackPlans)
      return fallbackPlans
    }

    if (isFetchingRef.current) {
      if (cachedPlans && cachedPlans.length > 0 && plansHaveContractMetadata(cachedPlans)) {
        return cachedPlans
      }

      const cachedFromStorage = readCachedPlans(resolvedProjectId)
      if (cachedFromStorage) {
        return cachedFromStorage.plans.map((plan) => ({
          ...plan,
          description: plan.description ?? ''
        }))
      }

      return []
    }

    if (cachedPlans && cachedPlans.length > 0 && plansHaveContractMetadata(cachedPlans)) {
      return cachedPlans
    }

    if (cachedPlans && cachedPlans.length > 0 && !plansHaveContractMetadata(cachedPlans)) {
      setCachedPlans(null)
    }

    const cachedFromStorage = readCachedPlans(resolvedProjectId)
    if (cachedFromStorage) {
      const normalizedPlans: SubscriptionPlan[] = cachedFromStorage.plans.map((plan) => ({
        ...plan,
        description: plan.description ?? ''
      }))
      if (plansHaveContractMetadata(normalizedPlans)) {
        setCachedPlans(normalizedPlans)
        writeCachedPlans(resolvedProjectId, normalizedPlans)
        return normalizedPlans
      }
    }

    if (!resolvedProjectId) {
      const fallbackPlans: SubscriptionPlan[] = FALLBACK_DEMO_PLANS.map((plan) => ({
        ...plan,
        description: ''
      }))
      setCachedPlans(fallbackPlans)
      return fallbackPlans
    }

    setIsLoading(true)
    setError(null)
    isFetchingRef.current = true

    try {
      const contractConfig = await ensureContractConfig()
      if (!contractConfig) {
        return []
      }

      // Try to get the next plan ID first
      const nextPlanId = await publicClientRef.current.readContract({
        address: contractConfig.subscriptionManagerAddress,
        abi: CONTRACTS.SubscriptionManager.abi,
        functionName: 'nextPlanId',
      })

      if (!nextPlanId || Number(nextPlanId) === 0) {
        console.log('No plans found in contract')
        return []
      }

      const plans: SubscriptionPlan[] = []
      const maxPlans = Number(nextPlanId) // Read all available plans
      
      // Get all plans, but only keep the first 3 active ones
      for (let i = 0; i < maxPlans && plans.length < 3; i++) {
        if (!isMountedRef.current) break

        try {
          const plan = await publicClientRef.current.readContract({
            address: contractConfig.subscriptionManagerAddress,
            abi: CONTRACTS.SubscriptionManager.abi,
            functionName: 'getPlan',
            args: [BigInt(i)],
          }) as { id: bigint; name: string; price: bigint; period: bigint; active: boolean; tokenAddress: string } | null

          if (plan && plan.active) {
            const priceInUSDC = await formatTokenAmountRef.current!(
              plan.price,
              plan.tokenAddress || contractConfig.tokenAddress
            )
            const durationInSeconds = Number(plan.period)
            
            // Format duration to human-readable format
            const formatDuration = (seconds: number) => {
              if (seconds < 60) {
                return `${seconds} second${seconds !== 1 ? 's' : ''}`
              } else if (seconds < 3600) {
                const minutes = Math.floor(seconds / 60)
                return `${minutes} minute${minutes !== 1 ? 's' : ''}`
              } else if (seconds < 86400) {
                const hours = Math.floor(seconds / 3600)
                return `${hours} hour${hours !== 1 ? 's' : ''}`
              } else if (seconds < 604800) {
                const days = Math.floor(seconds / 86400)
                return `${days} day${days !== 1 ? 's' : ''}`
              } else if (seconds < 2592000) {
                const weeks = Math.floor(seconds / 604800)
                return `${weeks} week${weeks !== 1 ? 's' : ''}`
              } else {
                const months = Math.floor(seconds / 2592000)
                return `${months} month${months !== 1 ? 's' : ''}`
              }
            }
            
            plans.push({
              id: i.toString(),
              name: plan.name,
              description: '',
              price: parseFloat(priceInUSDC),
              duration: durationInSeconds,
              durationText: formatDuration(durationInSeconds),
              features: [
                'MetaMask Smart Account integration',
                'Automated subscription payments',
                'USDC payment support',
                'Basic support',
                'Standard features'
              ],
              projectId: resolvedProjectId,
              project_id: resolvedProjectId,
              contract_plan_id: i,
              contractPlanId: i,
              tokenAddress: plan.tokenAddress || contractConfig.tokenAddress,
              tokenSymbol: 'USDC'
            })
          }
        } catch (err) {
          console.error(`Error reading plan ${i}:`, err)
        }
      }

      setCachedPlans(plans)
      writeCachedPlans(resolvedProjectId, plans)
      return plans
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get plans'
      if (message !== 'Authentication required') {
        console.error('Error getting all plans:', err)
        setError(message)
      }
      return []
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
      isFetchingRef.current = false
    }
  }, [authenticated, cachedPlans, ensureContractConfig, isInitialized, plansHaveContractMetadata, resolvedProjectId])

  return {
    getAllPlans,
    isLoading,
    error,
    cachedPlans,
  }
}
