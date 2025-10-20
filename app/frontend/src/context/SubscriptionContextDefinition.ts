import { createContext } from 'react'
import type { SubscriptionState } from '../types/subscription'

export interface SubscriptionContextType extends SubscriptionState {
  subscribe: (planId: string, txHash: string) => void
  cancelSubscription: (subscriptionId: string) => void
}

export const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined)