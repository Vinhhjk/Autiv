import { useEffect, useMemo, useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { createPublicClient, http } from 'viem'
import { parseUnits, encodeFunctionData } from 'viem'
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction'
import type { SmartAccount as ViemSmartAccount } from 'viem/account-abstraction'
import type { Delegation } from '@metamask/delegation-toolkit'
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit'
import { DelegationManager } from '@metamask/delegation-toolkit/contracts'
import { monadTestnet } from 'viem/chains'
import SubscriptionManagerABI from '../contracts/SubscriptionManager.json'
import { apiService } from '../services/api'

const MONAD_TESTNET_CHAIN_ID = 10143

// Define subscription data type - using string to avoid BigInt serialization issues
interface SubscriptionData {
  active: boolean;
  planId: bigint | string;
  startTime: bigint | string;
  endTime: bigint | string;
  [key: string]: unknown;
}

// Define a flexible smart account type that works with both MetaMask and Viem
interface FlexibleSmartAccount {
  address: `0x${string}`;
  isDeployed: () => Promise<boolean>;
  [key: string]: unknown;
}

type SignedDelegation = Delegation & { signature: string; salt?: string | number | bigint }

type StoredDelegation = {
  delegate: `0x${string}`
  delegator: `0x${string}`
  authority: `0x${string}`
  caveats?: StoredDelegationCaveat[]
  salt: `0x${string}`
  signature: `0x${string}`
}

type StoredDelegationCaveat = {
  enforcer: `0x${string}`
  terms: `0x${string}`
  args: `0x${string}`
}

const serializeDelegation = (delegation: SignedDelegation): Record<string, unknown> => {
  try {
    return JSON.parse(
      JSON.stringify(delegation, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
    )
  } catch (error) {
    console.error('Failed to serialize delegation:', error)
    return {
      error: 'failed_to_serialize',
    }
  }
}

export const useSmartAccountContractWriter = () => {
  useAccount()
  const { data: walletClient } = useWalletClient()
  const { sendTransaction, user } = usePrivy()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Create Alchemy bundler client for ERC-4337 support
  const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY || 'demo'

  
  // Use ref to ensure publicClient is created only once - exactly like the working script
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http('https://monad-testnet.drpc.org'),
  })

  let bundlerClient: ReturnType<typeof createBundlerClient> | null = null
  
  try {
    bundlerClient = createBundlerClient({
      client: publicClient,
      transport: http(`https://monad-testnet.g.alchemy.com/v2/${alchemyApiKey}`),
    })
  } catch (error) {
    console.log('Failed to create bundler client:', error)
    bundlerClient = null
  }

  let paymasterClient: ReturnType<typeof createPaymasterClient> | null = null
  try {
    paymasterClient = createPaymasterClient({
      transport: http(`https://monad-testnet.g.alchemy.com/v2/${alchemyApiKey}`)
    })
  } catch (e) {
    console.warn('Failed to create paymaster client, will fallback to bundler RPC for sponsorship:', e)
    paymasterClient = null
  }

  const [contractConfig, setContractConfig] = useState<{
    subscriptionManagerAddress: `0x${string}`
    tokenAddress: `0x${string}`
    projectId: string
  } | null>(null)
  const loadContractConfig = useMemo(() => async () => {
    if (contractConfig) return contractConfig

    const projectId = import.meta.env.VITE_DEMO_PROJECT_ID
    if (!projectId) {
      throw new Error('Demo project ID is not configured')
    }

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
        projectId,
      }

      setContractConfig(config)
      return config
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load contract configuration'
      throw new Error(message)
    }
  }, [contractConfig])

  useEffect(() => {
    loadContractConfig().catch((error) => {
      console.error('Error preloading contract configuration:', error)
    })
  }, [loadContractConfig])

  const subscribeWithSmartAccount = async (
    smartAccount: FlexibleSmartAccount,
    planId: number,
    planPrice: number,
    tokenAddress?: string,
    subscriptionManagerAddress?: `0x${string}`,
    signedApproveDelegation?: SignedDelegation,
    signedProcessPaymentDelegation?: SignedDelegation
  ) => {
    if (!smartAccount) {
      throw new Error('Smart Account not available')
    }

    const config = await loadContractConfig()
    const resolvedTokenAddress = (tokenAddress ?? config.tokenAddress) as `0x${string}`
    const resolvedSubscriptionManagerAddress = (subscriptionManagerAddress ?? config.subscriptionManagerAddress) as `0x${string}`

    setIsLoading(true)
    setError(null)

    try {
      // Convert price to wei (18 decimals for USDC)
      const priceInWei = parseUnits(planPrice.toString(), 18)

      // --- Parallelized reads ---
      console.log('=== Checking balance + existing subscription in parallel ===')
      const [smartAccountBalance, existingSubscription] = await Promise.all([
        publicClient.readContract({
          address: resolvedTokenAddress,
          abi: [
            {
              constant: true,
              inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
              name: 'balanceOf',
              outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'balanceOf',
          args: [smartAccount.address as `0x${string}`],
        }),
        publicClient.readContract({
          address: resolvedSubscriptionManagerAddress,
          abi: SubscriptionManagerABI.abi,
          functionName: 'getUserSubscription',
          args: [smartAccount.address as `0x${string}`],
        }),
      ])
      
      if (Number(smartAccountBalance) < Number(priceInWei)) {
        throw new Error(`Smart Account needs ${planPrice} USDC but only has ${Number(smartAccountBalance) / 1e18} USDC`)
      }
      
      const calls: { to: `0x${string}`; data: `0x${string}` }[] = []
      
      // 1) Approve token spending
      const approveCalldata = encodeFunctionData({
        abi: [
          {
            constant: false,
            inputs: [
              { internalType: 'address', name: 'spender', type: 'address' },
              { internalType: 'uint256', name: 'amount', type: 'uint256' },
            ],
            name: 'approve',
            outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ] as const,
        functionName: 'approve',
        args: [resolvedSubscriptionManagerAddress, priceInWei],
      })
      calls.push({ to: resolvedTokenAddress, data: approveCalldata })
      // 2) Optional cancel
      if (existingSubscription && typeof existingSubscription === 'object' && 'active' in existingSubscription && (existingSubscription as SubscriptionData).active) {
        console.log('User has active subscription — cancelling first...')
        const cancelCallData = encodeFunctionData({
          abi: SubscriptionManagerABI.abi,
          functionName: 'cancelSubscription',
          args: [],
        })
        calls.push({ to: resolvedSubscriptionManagerAddress, data: cancelCallData })
      }

      // 3) Subscribe with payment
      const subscribeCalldata = encodeFunctionData({
        abi: SubscriptionManagerABI.abi,
        functionName: 'subscribeWithPayment',
        args: [BigInt(planId)],
      })
      calls.push({ to: resolvedSubscriptionManagerAddress, data: subscribeCalldata })

      if (!bundlerClient || !paymasterClient) {
        throw new Error('Bundler or Paymaster client not available')
      }

      const userOperationHash: `0x${string}` = await bundlerClient.sendUserOperation({
        account: smartAccount as unknown as ViemSmartAccount,
        calls,
        paymaster: paymasterClient,
        paymasterContext: {
          policyId: import.meta.env.VITE_ALCHEMY_GAS_POLICY_ID
        },
      });

      const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOperationHash })
      const txHash = receipt?.receipt?.transactionHash || userOperationHash

      // Call API to create subscription and record payment in database
      if (user?.email?.address && user?.wallet?.address && txHash) {
        try {
          const currentTime = Math.floor(Date.now() / 1000);
          
          // Get project_id from environment or use demo default
          const projectId = config.projectId;
          
          // Prepare delegation data with both approve and processPayment delegations
          const delegationData = (signedApproveDelegation && signedProcessPaymentDelegation) ? {
            signedApproveDelegation: serializeDelegation(signedApproveDelegation),
            signedProcessPaymentDelegation: serializeDelegation(signedProcessPaymentDelegation)
          } : undefined;

          const subscriptionResult = await apiService.createSubscription({
            user_email: user.email.address,
            user_wallet_address: user.wallet.address,
            user_smart_account_address: smartAccount.address,
            plan_id: planId,
            project_id: projectId, // xata_id of the project
            tx_hash: txHash,
            start_date: currentTime,
            subscription_manager_address: resolvedSubscriptionManagerAddress,
            // Payment data - record payment in same API call
            amount: planPrice,
            token_address: resolvedTokenAddress,
            payment_date: currentTime,
            delegation_data: delegationData
          });

          if (subscriptionResult.success) {
            console.log('Smart Account subscription and payment recorded in database:', subscriptionResult.data?.message);
            if (subscriptionResult.data?.payment_id) {
              console.log('Payment ID:', subscriptionResult.data.payment_id);
            }
          } else {
            console.error('Failed to record Smart Account subscription in database:', subscriptionResult.error);
          }
        } catch (apiError) {
          console.error('API call failed:', apiError);
        }
      }
      return txHash

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smart Account subscription failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const isStoredDelegation = (
    value: unknown
  ): value is StoredDelegation => {
    if (!value || typeof value !== 'object') {
      return false
    }

    const record = value as Record<string, unknown>
    return (
      typeof record.delegate === 'string' &&
      typeof record.delegator === 'string' &&
      typeof record.authority === 'string' &&
      typeof record.salt === 'string' &&
      typeof record.signature === 'string'
    )
  }

  const normalizeCaveats = (
    caveats: unknown
  ): StoredDelegationCaveat[] => {
    if (!Array.isArray(caveats)) {
      return []
    }

    return caveats
      .filter((item): item is StoredDelegationCaveat => {
        if (!item || typeof item !== 'object') {
          return false
        }

        const record = item as Record<string, unknown>
        return (
          typeof record.enforcer === 'string' &&
          typeof record.terms === 'string' &&
          typeof record.args === 'string'
        )
      })
      .map(item => ({
        enforcer: item.enforcer,
        terms: item.terms,
        args: item.args
      }))
  }

  const extractDelegationForDisable = (value: unknown): StoredDelegation | null => {
    if (isStoredDelegation(value)) {
      return value
    }

    if (!value || typeof value !== 'object') {
      return null
    }

    const record = value as Record<string, unknown>
    if (record.delegation) {
      return extractDelegationForDisable(record.delegation)
    }

    if (record.signedProcessPaymentDelegation) {
      return extractDelegationForDisable(record.signedProcessPaymentDelegation)
    }

    if (record.processPaymentDelegation) {
      return extractDelegationForDisable(record.processPaymentDelegation)
    }

    if (record.signedDelegations && Array.isArray(record.signedDelegations)) {
      for (const entry of record.signedDelegations) {
        const extractedDelegation = extractDelegationForDisable(entry)
        if (extractedDelegation) {
          return extractedDelegation
        }
      }
    }

    return null
  }

  const cancelSubscriptionWithSmartAccount = async (
    smartAccount: FlexibleSmartAccount,
    tokenAddress?: string,
    subscriptionManagerAddress?: `0x${string}`,
    planId?: string
  ) => {
    if (!smartAccount) {
      throw new Error('Smart Account not available')
    }

    const config = await loadContractConfig()
    const resolvedTokenAddress = (tokenAddress ?? config.tokenAddress) as `0x${string}`
    const resolvedSubscriptionManagerAddress = (subscriptionManagerAddress ?? config.subscriptionManagerAddress) as `0x${string}`

    setIsLoading(true)
    setError(null)

    try {
      if (!bundlerClient || !paymasterClient) {
        throw new Error('Bundler or Paymaster client not available')
      }

      // Prepare calls array
      const calls: { to: `0x${string}`; data: `0x${string}` }[] = []

      // 1. Fetch delegation from database (if exists)
      console.log('Fetching delegation from database...')
      let delegation: unknown = null
      try {
        const delegationResponse = await apiService.getUserDelegation({
          user_smart_account: smartAccount.address,
          subscription_manager_address: resolvedSubscriptionManagerAddress,
        })

        console.log('Delegation API response:', delegationResponse)

        if (delegationResponse.success && delegationResponse.data) {
          const apiData = delegationResponse.data as unknown as { success: boolean; data: { delegation: unknown } }
          delegation = apiData.data.delegation
          console.log('Delegation found:', delegation)
        } else {
          console.log('No delegation found in response')
        }
      } catch (error) {
        console.log('Error fetching delegation:', error)
      }

      // 2. Revoke token approval FIRST
      const revokeCalldata = encodeFunctionData({
        abi: [
          {
            constant: false,
            inputs: [
              { internalType: 'address', name: 'spender', type: 'address' },
              { internalType: 'uint256', name: 'amount', type: 'uint256' },
            ],
            name: 'approve',
            outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ] as const,
        functionName: 'approve',
        args: [resolvedSubscriptionManagerAddress, 0n],
      })
      calls.push({
        to: resolvedTokenAddress,
        data: revokeCalldata
      })

      // 3. Cancel subscription SECOND
      const cancelCallData = encodeFunctionData({
        abi: SubscriptionManagerABI.abi,
        functionName: 'cancelSubscription',
        args: []
      })
      calls.push({
        to: resolvedSubscriptionManagerAddress,
        data: cancelCallData
      })
      // 3. Add disable delegation call if delegation exists (before sending transaction)
      const delegationForDisable = extractDelegationForDisable(delegation)
      if (delegationForDisable) {
        console.log('Adding delegation disable to transaction...')
        const environment = getDeleGatorEnvironment(MONAD_TESTNET_CHAIN_ID)
        if (environment) {
          console.log('DeleGator environment found:', environment.DelegationManager)
          try {
            const disableDelegationCalldata = DelegationManager.encode.disableDelegation({
              delegation: {
                delegate: delegationForDisable.delegate,
                delegator: delegationForDisable.delegator,
                authority: delegationForDisable.authority,
                caveats: normalizeCaveats(delegationForDisable.caveats),
                salt: delegationForDisable.salt,
                signature: delegationForDisable.signature
              },
            })

            calls.push({
              to: environment.DelegationManager,
              data: disableDelegationCalldata,
            })
          } catch (encodeError) {
            console.error('Failed to encode disable delegation:', encodeError)
            // Don't throw - continue with cancel operations
          }
        } else {
          console.warn('DeleGator environment not found for chain ID:', MONAD_TESTNET_CHAIN_ID)
        }
      } else if (delegation) {
        console.warn('Delegation data missing required fields, skipping disable step')
      }

      // Send transaction: revoke + cancel + disable delegation (if applicable)
      const cancelUoHash = await bundlerClient.sendUserOperation({
        account: smartAccount as unknown as ViemSmartAccount,
        calls,
        paymaster: paymasterClient,
        paymasterContext: { policyId: import.meta.env.VITE_ALCHEMY_GAS_POLICY_ID }
      })

      const cancelReceipt = await bundlerClient.waitForUserOperationReceipt({ hash: cancelUoHash })
      const txHash = cancelReceipt?.receipt?.transactionHash || cancelUoHash
      console.log('Combined transaction confirmed:', txHash)
      // Call API to cancel subscription in database
      if (user?.email?.address && user?.wallet?.address && txHash) {
        try {
          const cancellationResult = await apiService.cancelSubscription({
            user_email: user.email.address,
            user_wallet_address: user.wallet.address,
            user_smart_account_address: smartAccount.address,
            subscription_manager_address: resolvedSubscriptionManagerAddress,
            plan_id: planId,
            tx_hash: txHash
          });

          if (cancellationResult.success) {
            console.log('Smart Account subscription cancellation recorded in database:', cancellationResult.data?.message);
          } else {
            console.error('Failed to record Smart Account cancellation in database:', cancellationResult.error);
          }
        } catch (apiError) {
          console.error('API call failed:', apiError);
        }
      }

      return txHash

    } catch (err) {
      console.error('Cancellation error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Smart Account cancellation failed'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const transferUSDCToSmartAccount = async (smartAccount: FlexibleSmartAccount, amount: number, tokenAddress: string) => {
    if (!smartAccount) {
      throw new Error('Smart Account not available')
    }

    if (!walletClient) {
      throw new Error('Wallet client not available')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountInWei = parseUnits(amount.toString(), 18)
      const { hash: transferTxHash } = await sendTransaction({
        to: tokenAddress as `0x${string}`,
        data: encodeFunctionData({
          abi: [
            {
              "constant": false,
              "inputs": [
                {"internalType": "address", "name": "to", "type": "address"},
                {"internalType": "uint256", "name": "amount", "type": "uint256"}
              ],
              "name": "transfer",
              "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
              "stateMutability": "nonpayable",
              "type": "function"
            }
          ],
          functionName: 'transfer',
          args: [smartAccount.address as `0x${string}`, amountInWei]
        })
      })
      await publicClient.waitForTransactionReceipt({ hash: transferTxHash, timeout: 60000 })
      return transferTxHash

    } catch (err) {
      setError(err instanceof Error ? err.message : 'USDC transfer failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const fundSmartAccountWithETH = async (smartAccount: FlexibleSmartAccount, amount: number) => {
    if (!smartAccount) {
      throw new Error('Smart Account not available')
    }

    if (!walletClient) {
      throw new Error('Wallet client not available')
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountInWei = parseUnits(amount.toString(), 18)
      const { hash: transferTxHash } = await sendTransaction({
        to: smartAccount.address as `0x${string}`,
        value: amountInWei,
      })
      await publicClient.waitForTransactionReceipt({ hash: transferTxHash, timeout: 60000 })
      return transferTxHash

    } catch (err) {
      setError(err instanceof Error ? err.message : 'ETH transfer failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return {
    subscribeWithSmartAccount,
    cancelSubscriptionWithSmartAccount,
    transferUSDCToSmartAccount,
    fundSmartAccountWithETH,
    isLoading,
    error
  }
}
