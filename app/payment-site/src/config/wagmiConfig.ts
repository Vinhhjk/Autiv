import { createConfig } from '@privy-io/wagmi';
import { monadTestnet } from 'viem/chains';
import { http } from 'viem';

// Create wagmi config with Monad testnet
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http('https://monad-testnet.drpc.org'),
  },
});






