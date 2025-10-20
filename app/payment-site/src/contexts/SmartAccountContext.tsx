import React from 'react'
import type { ReactNode } from 'react'
import { useMetaMaskSmartAccount } from '../hooks/useMetaMaskSmartAccount'
import { SmartAccountContext } from './SmartAccountTypes'

export const SmartAccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const smartAccountHook = useMetaMaskSmartAccount()

  return (
    <SmartAccountContext.Provider value={smartAccountHook}>
      {children}
    </SmartAccountContext.Provider>
  )
}
