import { usePrivy } from '@privy-io/react-auth';
import { useMemo } from 'react';
import { createWalletClient, http } from 'viem';
import { monadTestnet } from '../config/chains';

/**
 * Compatibility hook that provides wagmi-like interface using Privy
 * This allows existing wagmi-based hooks to work with Privy
 */
export const usePrivyWagmi = () => {
  const { ready, authenticated, user } = usePrivy();
  
  const address = user?.wallet?.address;
  const isConnected = authenticated && !!address;
  
  // Create a wallet client from Privy's wallet
  const walletClient = useMemo(() => {
    if (!user?.wallet || !isConnected) return undefined;
    
    return createWalletClient({
      account: address as `0x${string}`,
      chain: monadTestnet,
      transport: http('https://monad-testnet.drpc.org'),
    });
  }, [user?.wallet, isConnected, address]);

  // Create a public client for read operations
  const publicClient = useMemo(() => {
    return createWalletClient({
      chain: monadTestnet,
      transport: http('https://monad-testnet.drpc.org'),
    });
  }, []);

  return {
    address: address as `0x${string}` | undefined,
    isConnected,
    walletClient,
    publicClient,
    ready,
    authenticated,
    user,
  };
};

/**
 * Hook that mimics wagmi's useAccount
 */
export const useAccount = () => {
  const { address, isConnected } = usePrivyWagmi();
  
  return {
    address,
    isConnected,
  };
};

/**
 * Hook that mimics wagmi's useWalletClient
 */
export const useWalletClient = () => {
  const { walletClient } = usePrivyWagmi();
  
  return {
    data: walletClient,
  };
};

/**
 * Hook that mimics wagmi's usePublicClient
 */
export const usePublicClient = () => {
  const { publicClient } = usePrivyWagmi();
  
  return publicClient;
};
