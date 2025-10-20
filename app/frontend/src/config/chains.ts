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
        'https://monad-testnet.drpc.org',
        'https://monad-testnet.drpc.org', // Fallback
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


export const AGENT_ADDRESS = '0x406b16A36926814305dF25757c93d298b639Bef0'