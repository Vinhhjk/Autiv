import React, { useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import type { UserSubscription } from '../types/subscription'

interface ApiSubscription {
  plan_id: string
  plan_name: string
  company_name: string
  status: string
  start_date: number
  next_payment_date?: number
  last_payment_date?: number
  cancelled_at?: number
  cancellation_effective_at?: number
  price?: number
  subscription_manager_address?: string
  token_symbol?: string
  token_address?: string
}

export const useUserSubscriptions = () => {
  const { subscriptions: authSubscriptions, isLoading, refreshUserData } = useAuth()
  const [processedSubscriptions, setProcessedSubscriptions] = useState<UserSubscription[]>([])

  // Process subscriptions from AuthContext with client-side expiration logic
  const processSubscriptions = useCallback((apiSubscriptions: ApiSubscription[]) => {
    if (!apiSubscriptions || apiSubscriptions.length === 0) {
      setProcessedSubscriptions([])
      return []
    }

    const processed = apiSubscriptions.map((apiSub) => {
      const now = Math.floor(Date.now() / 1000)
      const nextPaymentDate = apiSub.next_payment_date || 0
      const cancelledAt = apiSub.cancelled_at || 0
      const cancellationEffectiveAt = apiSub.cancellation_effective_at || nextPaymentDate || cancelledAt || 0

      const initialStatus = apiSub.status as 'active' | 'expired' | 'cancelled'
      const cancellationPending = cancelledAt > 0 && cancellationEffectiveAt > now

      let clientStatus: 'active' | 'expired' | 'cancelled' = initialStatus

      if (cancelledAt > 0 && cancellationEffectiveAt <= now) {
        clientStatus = 'cancelled'
      } else if (!cancellationPending && clientStatus === 'active' && nextPaymentDate > 0 && nextPaymentDate < now) {
        clientStatus = 'expired'
      }

      const fallbackTimestamp = nextPaymentDate || cancellationEffectiveAt || apiSub.start_date
      const endTimestamp = cancellationPending
        ? cancellationEffectiveAt
        : clientStatus === 'expired'
          ? (nextPaymentDate || cancellationEffectiveAt || cancelledAt || apiSub.start_date)
          : fallbackTimestamp

      const subscriptionId = `${apiSub.plan_id}-${apiSub.start_date}`

      const userSubscription: UserSubscription = {
        id: subscriptionId,
        planId: apiSub.plan_id,
        planName: apiSub.plan_name,
        companyName: apiSub.company_name,
        startDate: new Date(apiSub.start_date * 1000),
        endDate: new Date(endTimestamp * 1000),
        status: clientStatus,
        price: apiSub.price || 0,
        cancelledAt: cancelledAt > 0 ? new Date(cancelledAt * 1000) : undefined,
        cancellationEffectiveAt: cancellationEffectiveAt > 0 ? new Date(cancellationEffectiveAt * 1000) : undefined,
        isCancellationPending: cancellationPending,
        subscriptionManagerAddress: apiSub.subscription_manager_address,
        tokenSymbol: apiSub.token_symbol,
        tokenAddress: apiSub.token_address,
      }

      return userSubscription
    })

    setProcessedSubscriptions(processed)
    return processed
  }, [])

  // Process subscriptions whenever authSubscriptions changes
  React.useEffect(() => {
    processSubscriptions(authSubscriptions)
  }, [authSubscriptions, processSubscriptions])

  // Refresh function that uses AuthContext's refresh
  const getUserSubscriptions = useCallback(async () => {
    await refreshUserData()
    // Return the current processed subscriptions at the time of call
    return processedSubscriptions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshUserData])

  return {
    subscriptions: processedSubscriptions,
    getUserSubscriptions,
    isLoading,
    error: null, // AuthContext handles errors
  }
}
