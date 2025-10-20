import { useContext } from 'react'
import { SubscriptionContext } from '../context/SubscriptionContextDefinition'

export const useSubscription = () => {
  const context = useContext(SubscriptionContext)
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider')
  }
  return context
}