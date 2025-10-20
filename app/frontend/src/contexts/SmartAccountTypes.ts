import { createContext } from 'react'

export interface SmartAccountResult {
  smartAccount: {
    address: `0x${string}`;
    isDeployed: () => Promise<boolean>;
    [key: string]: unknown;
  };
  address: string;
  isDeployed: boolean;
}

export interface SmartAccountInfo {
  address: string;
  isDeployed: boolean;
  [key: string]: unknown;
}

export interface SmartAccountContextType {
  createSmartAccount: () => Promise<SmartAccountResult | null>
  getSmartAccountInfo: () => SmartAccountInfo | null
  getStoredSmartAccountAddress: () => string | null
  clearStoredSmartAccount: () => void
  updateSmartAccountDeploymentStatus: () => Promise<boolean>
  smartAccountResult: SmartAccountResult | null
  isLoading: boolean
  error: string | null
  isWalletClientReady: boolean
}

export const SmartAccountContext = createContext<SmartAccountContextType | undefined>(undefined)
