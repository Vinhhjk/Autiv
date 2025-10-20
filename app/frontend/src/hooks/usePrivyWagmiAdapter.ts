import { usePrivy } from '@privy-io/react-auth';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPublicClient, http, encodeFunctionData } from 'viem';
import { monadTestnet } from 'viem/chains';

// Type definitions for better type safety
interface ContractABI {
  readonly name?: string;
  readonly type: string;
  readonly inputs?: readonly { name: string; type: string; internalType?: string }[];
  readonly outputs?: readonly { name: string; type: string; internalType?: string }[];
  readonly stateMutability?: string;
  readonly constant?: boolean;
  readonly anonymous?: boolean;
}

type ContractFunction = {
  address: `0x${string}`;
  abi: readonly ContractABI[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/**
 * Comprehensive wagmi compatibility layer for Privy
 * This provides all the wagmi hooks that your existing code expects
 */

// Mock transaction receipt for compatibility
interface TransactionReceipt {
  hash: `0x${string}`;
  blockHash: `0x${string}`;
  blockNumber: bigint;
  transactionIndex: number;
  from: `0x${string}`;
  to: `0x${string}` | null;
  cumulativeGasUsed: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  contractAddress: `0x${string}` | null;
  logs: readonly unknown[];
  logsBloom: `0x${string}`;
  root?: `0x${string}`;
  status: 'success' | 'reverted';
  type: 'legacy' | 'eip2930' | 'eip1559';
}

export const usePrivyWagmiAdapter = () => {
  const { ready, authenticated, user } = usePrivy();
  
  const address = user?.wallet?.address;
  const isConnected = authenticated && !!address;
  
  // Return Privy's wallet directly - it has its own sendTransaction method
  const walletClient = useMemo(() => {
    if (!user?.wallet || !isConnected) return undefined;
    
    // Return Privy's wallet object which has sendTransaction method
    return user.wallet;
  }, [user?.wallet, isConnected]);

  const publicClient = useMemo(() => {
    // Use simple http transport like the working script
    return createPublicClient({
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
  const { address, isConnected } = usePrivyWagmiAdapter();
  
  return {
    address,
    isConnected,
  };
};

/**
 * Hook that mimics wagmi's useWalletClient
 */
export const useWalletClient = () => {
  const { walletClient } = usePrivyWagmiAdapter();
  
  return {
    data: walletClient,
  };
};

/**
 * Hook that mimics wagmi's usePublicClient
 */
export const usePublicClient = () => {
  const { publicClient } = usePrivyWagmiAdapter();
  
  return publicClient;
};

/**
 * Hook that mimics wagmi's useWriteContract
 */
export const useWriteContract = () => {
  const { isConnected } = usePrivyWagmiAdapter();
  const { sendTransaction } = usePrivy();
  const [isPending, setIsPending] = useState(false);
  const [hash, setHash] = useState<`0x${string}` | undefined>();

  const writeContract = useCallback(async (params: ContractFunction) => {
    if (!isConnected) {
      throw new Error('Wallet not connected');
    }

    setIsPending(true);
    try {
      const { hash: txHash } = await sendTransaction({
        to: params.address,
        data: encodeFunctionData({
          abi: params.abi,
          functionName: params.functionName,
          args: params.args || [],
        }),
        value: params.value || 0n,
      });
      
      setHash(txHash);
      return txHash;
    } catch (error) {
      console.error('Contract write error:', error);
      throw error;
    } finally {
      setIsPending(false);
    }
  }, [isConnected, sendTransaction]);

  return {
    writeContract,
    isPending,
    data: hash,
  };
};

/**
 * Hook that mimics wagmi's useReadContract
 */
export const useReadContract = (params: Omit<ContractFunction, 'value'>) => {
  const { publicClient } = usePrivyWagmiAdapter();
  const [data, setData] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const readContract = useCallback(async () => {
    if (!publicClient) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const result = await publicClient.readContract({
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args || [],
      });
      setData(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Contract read failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, params.address, params.abi, params.functionName, params.args]);

  // Auto-read when component mounts
  useEffect(() => {
    readContract();
  }, [readContract]);

  return {
    data,
    isLoading,
    error,
    refetch: readContract,
  };
};

/**
 * Hook that mimics wagmi's useWaitForTransactionReceipt
 */
export const useWaitForTransactionReceipt = (params: { hash?: `0x${string}` }) => {
  const { publicClient } = usePrivyWagmiAdapter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);

  const waitForReceipt = useCallback(async (txHash: `0x${string}`) => {
    if (!publicClient) return null;
    
    setIsLoading(true);
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      setReceipt(receipt as unknown as TransactionReceipt);
      setIsSuccess(receipt.status === 'success');
      return receipt;
    } catch (error) {
      console.error('Transaction receipt error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [publicClient]);

  // Auto-wait for receipt when hash changes
  useMemo(() => {
    if (params.hash) {
      waitForReceipt(params.hash);
    }
  }, [params.hash, waitForReceipt]);

  return {
    isLoading,
    isSuccess,
    data: receipt,
  };
};
