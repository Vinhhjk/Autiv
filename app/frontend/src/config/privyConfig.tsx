import { monadTestnet } from './chains';

export const privyConfig = {
  appId: import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id-here',
  config: {
    // Configure supported login methods
    loginMethods: ['email', 'google'] as ('email' | 'google')[],
    
    // Configure appearance
    appearance: {
      theme: 'light' as const,
      accentColor: '#676FFF' as `#${string}`,
      logo: 'https://your-logo-url.com/logo.png',
    },
    
    // Simple embedded wallet configuration
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'users-without-wallets' as const,
      },
    },
    
    // Configure supported chains
    defaultChain: monadTestnet,
    supportedChains: [monadTestnet],
  },
};
