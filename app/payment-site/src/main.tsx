import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { PrivyAuthProvider } from './context/privyContext'
import { TransactionProvider } from './context/TransactionContext'
import PrivyErrorBoundary from './components/PrivyErrorBoundary'
import { suppressPrivyWarnings } from './utils/suppressPrivyWarnings'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from '@privy-io/wagmi'
import { wagmiConfig } from './config/wagmiConfig'
import Router from '../router'

// Create QueryClient for wagmi
const queryClient = new QueryClient()

// Polyfill Buffer for Privy compatibility
if (typeof globalThis.Buffer === 'undefined') {
  const { Buffer } = await import('buffer');
  globalThis.Buffer = Buffer;
}

// Add BigInt serializer to prevent JSON.stringify errors
if (typeof BigInt !== 'undefined') {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function() {
    return this.toString();
  };
}

// Suppress Privy hydration warnings in development
suppressPrivyWarnings();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyErrorBoundary>
      <PrivyAuthProvider>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <TransactionProvider>
              <Router />
            </TransactionProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyAuthProvider>
    </PrivyErrorBoundary>
  </StrictMode>,
)
