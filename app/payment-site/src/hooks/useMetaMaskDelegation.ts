import { useState, useCallback } from 'react'
import { createDelegation, createExecution, ExecutionMode, type Delegation } from '@metamask/delegation-toolkit'
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit'
import { AGENT_ADDRESS } from '../config/chains'
import { monadTestnet } from '../config/chains'

export const useMetaMaskDelegation = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  type DelegationSummary = {
    from?: `0x${string}`
    to?: `0x${string}`
    scopeType?: string
    tokenAddress?: `0x${string}`
    maxAmount?: bigint
  } | null

  const getDelegationSummary = useCallback((d?: (Delegation & { signature?: string }) | null): DelegationSummary => {
    const del = d
    if (!del) return null
    const delAny = del as unknown as { from?: `0x${string}`; to?: `0x${string}`; delegator?: `0x${string}`; delegate?: `0x${string}`; scope?: { type?: string; tokenAddress?: `0x${string}`; maxAmount?: unknown }; authority?: { enforcer?: `0x${string}` }; caveats?: Array<{ enforcer?: `0x${string}` }> }
    const scope = delAny.scope || {}
    const scopeType = scope.type || (delAny.authority?.enforcer ? 'authority' : (delAny.caveats && delAny.caveats.length > 0 ? 'caveat' : undefined))
    return {
      from: delAny.from ?? delAny.delegator,
      to: delAny.to ?? delAny.delegate,
      scopeType,
      tokenAddress: scope.tokenAddress,
      maxAmount: typeof scope.maxAmount === 'bigint' ? (scope.maxAmount as bigint) : undefined,
    }
  }, [])

  const createDelegationForUser = useCallback(async (
    smartAccountAddress: string,
    subscriptionManagerAddress: `0x${string}`,
    planData: { price: number; duration: number; tokenAddress: string }
  ) => {
    setIsLoading(true)
    setError(null)

    try {
      // console.log('Smart Account:', smartAccountAddress)
      // Get delegation environment for Monad Testnet
      const environment = getDeleGatorEnvironment(monadTestnet.id)
      if (!environment) {
        throw new Error('Delegation environment not found for Monad Testnet')
      }

      // Plan data for delegation
      const tokenAddress = planData.tokenAddress
      // const periodAmount = BigInt(Math.floor(planData.price * 1e18)) // Convert to wei

      // console.log('Creating TWO separate delegations:', {
      //   tokenAddress,
      //   periodAmount: periodAmount.toString(),
      //   smartAccountAddress,
      //   subscriptionManager: subscriptionManagerAddress
      // })

      const currentTime = Math.floor(Date.now() / 1000);

      // Delegation 1: Approve token spending
      const approveDelegation = createDelegation({
        to: AGENT_ADDRESS as `0x${string}`, // Agent that will execute
        from: smartAccountAddress as `0x${string}`,
        environment,
        scope: {
          type: 'functionCall',
          targets: [tokenAddress as `0x${string}`],
          selectors: ['approve(address,uint256)'],
        },
        salt: `0x${currentTime.toString(16)}`,
      })

      // Delegation 2: ProcessPayment on SubscriptionManager
      const processPaymentDelegation = createDelegation({
        to: AGENT_ADDRESS as `0x${string}`, // Agent that will execute
        from: smartAccountAddress as `0x${string}`,
        environment,
        scope: {
          type: 'functionCall',
          targets: [subscriptionManagerAddress],
          selectors: ['processPayment(address)'],
        },
        salt: `0x${(currentTime + 1).toString(16)}`, // Different salt
      })

      // console.log('Two delegations created successfully!')

      return {
        approveDelegation,
        processPaymentDelegation
      }

    } catch (err) {
      console.error('Error creating MetaMask delegations:', err)
      setError(err instanceof Error ? err.message : 'Failed to create delegations')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signDelegation = useCallback(async (smartAccount: { signDelegation?: (params: { delegation: Delegation }) => Promise<string> } & Record<string, unknown>, delegation: Delegation) => {
    if (!smartAccount) {
      throw new Error('Smart Account not available')
    }

    try {
      // console.log('Signing delegation with MetaMask Smart Account...')

      // Check if signDelegation method exists
      if (!smartAccount.signDelegation) {
        throw new Error('Smart Account does not support delegation signing')
      }

      // Sign the delegation with the Smart Account
      const signature = await smartAccount.signDelegation({
        delegation,
      })

      const signedDelegation = {
        ...delegation,
        signature: signature as `0x${string}`,
      }

      console.log('Delegation signed successfully!')
      return signedDelegation

    } catch (err) {
      console.error('Error signing delegation:', err)
      throw err
    }
  }, [])

  const redeemDelegation = useCallback(async (
    signedDelegation: Delegation & { signature: string },
    smartAccount: unknown,
    subscriptionManagerAddress: `0x${string}`
  ) => {
    if (!smartAccount) {
      throw new Error('Smart Account not available')
    }

    try {
      console.log('Redeeming delegation for automatic charging...')
      
      // Create execution for the subscription payment
      const execution = createExecution({
        target: subscriptionManagerAddress,
        value: 0n
      })

      // Prepare delegation redemption data
      const delegations = [signedDelegation]
      const modes = [ExecutionMode.SingleDefault]
      const executions = [execution]

      // console.log('Delegation redemption data:', {
      //   delegations: delegations.length,
      //   modes,
      //   executions: executions.length
      // })

      // Get delegation environment
      const environment = getDeleGatorEnvironment(monadTestnet.id)
      if (!environment) {
        throw new Error('Delegation environment not found')
      }
      // console.log('Delegation ready for automatic execution!')

      return {
        delegations,
        modes,
        executions,
        environment
      }

    } catch (err) {
      console.error('Error redeeming delegation:', err)
      throw err
    }
  }, [])

  return {
    createDelegation: createDelegationForUser,
    signDelegation,
    redeemDelegation,
    getDelegationSummary,
    isLoading,
    error
  }
}
