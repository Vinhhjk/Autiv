import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit'
import { createPublicClient, createWalletClient, custom, http } from 'viem'
import type { EIP1193Provider, WalletClient } from 'viem'
import { monadTestnet } from 'viem/chains'

interface SmartAccountResult {
  smartAccount: {
    address: `0x${string}`;
    isDeployed: () => Promise<boolean>;
    [key: string]: unknown;
  }
  address: string
  isDeployed: boolean
}

export const useMetaMaskSmartAccount = () => {
  const { address, isConnected } = useAccount()
  const { data: wagmiWalletClient } = useWalletClient()
  const { wallets } = useWallets()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [smartAccountResult, setSmartAccountResult] = useState<SmartAccountResult | null>(null)
  const [walletClientReady, setWalletClientReady] = useState(false)
  const [privyWalletClient, setPrivyWalletClient] = useState<WalletClient | null>(null)
  const hasSetActiveWallet = useRef(false)
  const isCreatingSmartAccount = useRef(false)
  const hasLoadedFromStorage = useRef(false)
  
  // Use ref to ensure publicClient is created only once - exactly like the working script
  const publicClientRef = useRef(createPublicClient({
    chain: monadTestnet,
    transport: http('https://monad-testnet.drpc.org'),
  }))
  
  // Create wallet client directly from Privy's embedded wallet
  useEffect(() => {
    const createPrivyClient = async () => {
      if (!isConnected || !wallets || wallets.length === 0) return
      
      // Only create once
      if (hasSetActiveWallet.current) return
      
      // Find the embedded wallet
      const embeddedWallet = wallets.find(w => w.connectorType === 'embedded')
      
      if (!embeddedWallet) {
        console.log('No embedded wallet found')
        return
      }
      
      
      try {
        // Get the Ethereum provider from Privy's embedded wallet
        const provider = await embeddedWallet.getEthereumProvider()
        
        if (provider) {
          // Create a viem wallet client from Privy's provider
          const client = createWalletClient({
            account: embeddedWallet.address as `0x${string}`,
            chain: monadTestnet,
            transport: custom(provider as EIP1193Provider)
          })
          
          setPrivyWalletClient(client)
          hasSetActiveWallet.current = true
          // console.log('Wallet client created from Privy provider!')
        }
      } catch (err) {
        console.error('Failed to create wallet client from Privy:', err)
      }
    }
    
    createPrivyClient()
  }, [isConnected, wallets])
  
  // Check wallet client readiness - use either wagmi or Privy client
  useEffect(() => {
    const effectiveClient = wagmiWalletClient || privyWalletClient
    const isReady = !!(effectiveClient?.account)
    setWalletClientReady(isReady)
    
    // if (isReady && !walletClientReady) {
    //   console.log('Wallet client is ready!', {
    //     source: wagmiWalletClient ? 'wagmi' : 'privy',
    //     address: effectiveClient?.account?.address
    //   })
    // }
  }, [wagmiWalletClient, privyWalletClient, walletClientReady])

  const createSmartAccount = useCallback(async (): Promise<SmartAccountResult | null> => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected')
    }
    
    // Prevent duplicate creation
    if (isCreatingSmartAccount.current) {
      // console.log('Smart account creation already in progress, skipping...')
      return smartAccountResult
    }
    
    // If we already have a smart account result, return it
    if (smartAccountResult) {
      // console.log('Smart account already exists in state, reusing:', smartAccountResult.address)
      return smartAccountResult
    }
    
    // Use either wagmi or Privy wallet client
    const localWalletClient = wagmiWalletClient || privyWalletClient
    
    // Check if wallet client is ready
    if (!localWalletClient) {
      // throw new Error('Wallet client not available. Please wait a moment and try again.')
    }
    
    if (!localWalletClient?.account) {
      throw new Error('Wallet account not ready. Please wait a moment and try again.')
    }
    

    // console.log('Wallet client is ready with account:', localWalletClient.account.address)

    isCreatingSmartAccount.current = true
    setIsLoading(true)
    setError(null)

    try {

      // Create public client for Smart Account
      const publicClient = publicClientRef.current

      // Use the wallet client directly
      if (!localWalletClient) {
        throw new Error('Wallet client not available');
      }

      if (!localWalletClient.account) {
        throw new Error('Wallet client account not available');
      }


      // Create MetaMask Smart Account using Hybrid implementation
      const ownerAddress = localWalletClient.account.address
      
      const metaMaskSmartAccount = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [ownerAddress, [], [], []], // [owner, passkeyIds, passkeyX, passkeyY]
        deploySalt: "0x", // Use default salt
        signer: { walletClient: localWalletClient as never },
      })

      // Use the MetaMask smart account directly
      const smartAccount = metaMaskSmartAccount;
      // Check if smart account is actually deployed on-chain
      const isDeployed = await smartAccount.isDeployed()
      
      const result: SmartAccountResult = {
        smartAccount,
        address: smartAccount.address,
        isDeployed
      }

      setSmartAccountResult(result)
      try {
        const stored = { 
          address: smartAccount.address, 
          isDeployed,
          createdAt: new Date().toISOString()
        }
        localStorage.setItem('autiv.smartAccount', JSON.stringify(stored))
      } catch (e) {
        console.debug('localStorage save failed:', e)
      }
      return result

    } catch (err) {
      console.error('Error creating MetaMask Smart Account:', err)
      setError(err instanceof Error ? err.message : 'Failed to create Smart Account')
      throw err
    } finally {
      isCreatingSmartAccount.current = false
      setIsLoading(false)
    }
  }, [address, isConnected, wagmiWalletClient, privyWalletClient, smartAccountResult])
  
  // Auto-load smart account from localStorage on mount
  useEffect(() => {
    const loadStoredSmartAccount = async () => {
      // Only load once
      if (hasLoadedFromStorage.current) return
      
      // Only load if we don't have a smart account yet and wallet is ready
      if (smartAccountResult || !walletClientReady || !address || !isConnected) return
      
      const storedData = localStorage.getItem('autiv.smartAccount')
      if (!storedData) {
        hasLoadedFromStorage.current = true // Mark as attempted even if nothing found
        return
      }
      
      try {
        hasLoadedFromStorage.current = true
        // Recreate the smart account instance (required for each hook mount)
        await createSmartAccount()
      } catch (error) {
        console.error('Failed to load stored smart account:', error)
        hasLoadedFromStorage.current = true // Mark as attempted even on error
      }
    }
    
    loadStoredSmartAccount()
  }, [walletClientReady, address, isConnected, smartAccountResult, createSmartAccount])

  const getStoredSmartAccountAddress = useCallback((): string | null => {
    try {
      const raw = localStorage.getItem('autiv.smartAccount')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { address?: string }
      return typeof parsed?.address === 'string' ? parsed.address : null
    } catch (e) {
      console.debug('localStorage read failed:', e)
      return null
    }
  }, [])

  const clearStoredSmartAccount = useCallback(() => {
    try {
      localStorage.removeItem('autiv.smartAccount')
    } catch (e) {
      console.debug('localStorage remove failed:', e)
    }
  }, [])

  const updateSmartAccountDeploymentStatus = useCallback(async () => {
    if (!smartAccountResult?.smartAccount) return false
    
    try {
      const isDeployed = await smartAccountResult.smartAccount.isDeployed()
      
      // Update the stored smart account with new deployment status
      const stored = localStorage.getItem('autiv.smartAccount')
      if (stored) {
        const parsed = JSON.parse(stored)
        parsed.isDeployed = isDeployed
        localStorage.setItem('autiv.smartAccount', JSON.stringify(parsed))
      }
      
      // Update the state
      setSmartAccountResult(prev => prev ? { ...prev, isDeployed } : null)
      
      return isDeployed
    } catch (error) {
      console.error('Failed to update deployment status:', error)
      return false
    }
  }, [smartAccountResult?.smartAccount])

  const getSmartAccountInfo = useCallback(() => {
    if (!smartAccountResult) {
      return null
    }

    return {
      address: smartAccountResult.address,
      isDeployed: smartAccountResult.isDeployed,
      canAutoCharge: true, // Smart Account can handle automatic charging
      delegationEnabled: true, // Smart Account supports delegation
    }
  }, [smartAccountResult])

  return {
    createSmartAccount,
    getSmartAccountInfo,
    getStoredSmartAccountAddress,
    clearStoredSmartAccount,
    updateSmartAccountDeploymentStatus,
    smartAccountResult,
    isLoading,
    error,
    isWalletClientReady: walletClientReady
  }
}