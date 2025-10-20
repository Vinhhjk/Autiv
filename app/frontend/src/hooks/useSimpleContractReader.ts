import { useState, useCallback, useRef } from 'react'
import { createPublicClient, http } from 'viem'
import { monadTestnet } from '../config/chains'
import { CONTRACTS } from '../contracts'
import { apiService } from '../services/api'

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

export const useSimpleContractReader = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cachedPlans, setCachedPlans] = useState<unknown[]>([])
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

  const demoProjectId = import.meta.env.VITE_DEMO_PROJECT_ID || ''

  const getAllPlans = useCallback(async () => {
    if (!isMountedRef.current) return []

    setIsLoading(true)
    setError(null)

    try {
      if (!contractConfigRef.current) {
        if (!demoProjectId) {
          throw new Error('Demo project ID is not configured')
        }

        const response = await apiService.getProjectContractConfig(demoProjectId)

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load project contract configuration')
        }

        const { subscription_manager_address, token_address } = response.data

        if (!subscription_manager_address || !token_address) {
          throw new Error('Project contract configuration is missing required addresses')
        }

        contractConfigRef.current = {
          subscriptionManagerAddress: subscription_manager_address as `0x${string}`,
          tokenAddress: token_address as `0x${string}`,
        }
      }

      const contractConfig = contractConfigRef.current
      if (!contractConfig) {
        throw new Error('Failed to cache project contract configuration')
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

      const plans = []
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
              description: `Get access to ${plan.name} features`,
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
              projectId: demoProjectId,
              project_id: demoProjectId,
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
      return plans
    } catch (err) {
      console.error('Error getting all plans:', err)
      setError(err instanceof Error ? err.message : 'Failed to get plans')
      return []
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [demoProjectId])

  return {
    getAllPlans,
    isLoading,
    error,
    cachedPlans,
  }
}
