import { useContext } from 'react'
import { SmartAccountContext } from '../contexts/SmartAccountTypes'

export const useSmartAccount = () => {
  const context = useContext(SmartAccountContext)
  if (context === undefined) {
    throw new Error('useSmartAccount must be used within a SmartAccountProvider')
  }
  return context
}
