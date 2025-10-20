export interface SubscriptionPlan {
  id: string
  name: string
  description: string
  price: number // in USDC
  duration: number // in seconds
  durationText?: string // human-readable duration
  features: string[]
  tokenAddress?: string
  tokenSymbol?: string
}

export interface UserSubscription {
  id: string
  planId: string
  planName: string
  companyName: string
  startDate: Date
  endDate: Date
  status: 'active' | 'expired' | 'cancelled'
  price: number
  txHash?: string
  cancelledAt?: Date
  cancellationEffectiveAt?: Date
  isCancellationPending: boolean
  subscriptionManagerAddress?: string
  tokenSymbol?: string
  tokenAddress?: string
}

export interface SubscriptionState {
  plans: SubscriptionPlan[]
  userSubscriptions: UserSubscription[]
  isLoading: boolean
  error: string | null
}