import React, { useState, useEffect } from 'react'
import type { SubscriptionState, UserSubscription } from '../types/subscription'
import { subscriptionPlans } from '../data/subscriptionPlans'
import { SubscriptionContext } from './SubscriptionContextDefinition'
import { useAuth } from '../hooks/useAuth'

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userInfo, developerInfo } = useAuth()
  const [state, setState] = useState<SubscriptionState>({
    plans: subscriptionPlans,
    userSubscriptions: [],
    isLoading: false,
    error: null
  })

  // Load subscriptions from localStorage on mount
  useEffect(() => {
    const savedSubscriptions = localStorage.getItem('userSubscriptions')
    if (savedSubscriptions) {
      try {
        const subscriptions = JSON.parse(savedSubscriptions).map((sub: UserSubscription & { startDate: string; endDate: string }) => ({
          ...sub,
          startDate: new Date(sub.startDate),
          endDate: new Date(sub.endDate)
        }))
        setState(prev => ({ ...prev, userSubscriptions: subscriptions }))
      } catch (error) {
        console.error('Error loading subscriptions:', error)
      }
    }
  }, [])

  const subscribe = (planId: string, txHash: string) => {
    const plan = subscriptionPlans.find(p => p.id === planId)
    if (!plan) return

    const startDate = new Date()
    const endDate = new Date(startDate.getTime() + plan.duration * 24 * 60 * 60 * 1000)

    const newSubscription: UserSubscription = {
      id: `sub_${Date.now()}`,
      planId: plan.id,
      planName: plan.name,
      companyName: developerInfo?.company_name || userInfo?.email || 'Unknown Company',
      startDate,
      endDate,
      status: 'active',
      price: plan.price,
      txHash,
      isCancellationPending: false
    }

    const updatedSubscriptions = [...state.userSubscriptions, newSubscription]
    setState(prev => ({ ...prev, userSubscriptions: updatedSubscriptions }))
    localStorage.setItem('userSubscriptions', JSON.stringify(updatedSubscriptions))
  }

  const cancelSubscription = (subscriptionId: string) => {
    const updatedSubscriptions = state.userSubscriptions.map(sub =>
      sub.id === subscriptionId ? { ...sub, status: 'cancelled' as const } : sub
    )
    setState(prev => ({ ...prev, userSubscriptions: updatedSubscriptions }))
    localStorage.setItem('userSubscriptions', JSON.stringify(updatedSubscriptions))
  }

  return (
    <SubscriptionContext.Provider value={{
      ...state,
      subscribe,
      cancelSubscription
    }}>
      {children}
    </SubscriptionContext.Provider>
  )
}