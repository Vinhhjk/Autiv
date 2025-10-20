import { PrivyProvider } from '@privy-io/react-auth';
import { privyConfig } from '../config/privyConfig';

export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={privyConfig.appId}
      config={privyConfig.config}
    >
      {children}
    </PrivyProvider>
  );
}
