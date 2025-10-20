import { useEffect, useRef } from 'react'

interface Subscription {
  id: string
  endDate: Date
  status: 'active' | 'expired' | 'cancelled'
}

/**
 * Monitors subscription expiry and triggers a callback when a subscription expires
 * Checks every second to detect when endDate is reached
 */
export const useSubscriptionExpiryMonitor = (
  subscriptions: Subscription[],
  onExpiry: () => void
) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastCheckRef = useRef<{ [key: string]: boolean }>({})

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Only monitor active subscriptions
    const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active')

    if (activeSubscriptions.length === 0) {
      return
    }

    console.log('Starting subscription expiry monitor for', activeSubscriptions.length, 'subscriptions')

    // Check every second if any subscription has expired
    intervalRef.current = setInterval(() => {
      const now = new Date()
      
      activeSubscriptions.forEach(subscription => {
        const isExpired = now >= subscription.endDate
        const wasExpiredBefore = lastCheckRef.current[subscription.id]

        // Only trigger callback if subscription just expired (wasn't expired before)
        if (isExpired && !wasExpiredBefore) {
          console.log('Subscription expired:', subscription.id, 'at', now.toISOString())
          console.log('End date was:', subscription.endDate.toISOString())
          lastCheckRef.current[subscription.id] = true
          onExpiry()
        } else if (!isExpired) {
          // Reset the flag if subscription is not expired
          lastCheckRef.current[subscription.id] = false
        }
      })
    }, 1000) // Check every second

    // Cleanup on unmount or when subscriptions change
    return () => {
      if (intervalRef.current) {
        console.log('Stopping subscription expiry monitor')
        clearInterval(intervalRef.current)
      }
    }
  }, [subscriptions, onExpiry])

  return {
    isMonitoring: intervalRef.current !== null,
  }
}
