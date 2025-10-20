import { defineChain } from 'viem'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: [
        'https://testnet-rpc.monad.xyz',
        'https://testnet-rpc.monad.xyz', // Fallback
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
  testnet: true,
})

export const USDC_CONTRACT_ADDRESS = '0x7B35FBfa0635dbF7c4ACFA733585b90e3531888A'

// Autiv Contract Addresses (Deployed on Monad Testnet)
export const SUBSCRIPTION_MANAGER_ADDRESS = '0xd8840e4A14fDd6833F213919ebF5727ee9E2E4dB'

