// Type definitions for MetaMask Smart Account integration

export interface SmartAccountType {
  address: `0x${string}`
  environment: unknown
  signDelegation: (params: { delegation: unknown }) => Promise<string>
}

export interface DelegationParams {
  scope: {
    type: string
    tokenAddress: `0x${string}`
    maxAmount: bigint
  }
  to: `0x${string}`
  from: `0x${string}`
  environment: unknown
}