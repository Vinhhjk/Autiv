import type { SubscriptionPlan } from '../types/subscription'

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'basic',
    name: 'Basic Plan',
    description: 'Perfect for getting started with our services',
    price: 0.1,
    duration: 30,
    features: [
      'Basic API access',
      'Email support',
      '1,000 requests/month',
      'Standard documentation'
    ]
  },
  {
    id: 'pro',
    name: 'Pro Plan',
    description: 'Advanced features for growing businesses',
    price: 0.5,
    duration: 30,
    features: [
      'Advanced API access',
      'Priority support',
      '10,000 requests/month',
      'Advanced analytics',
      'Custom integrations'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise Plan',
    description: 'Full-featured plan for large organizations',
    price: 1.0,
    duration: 30,
    features: [
      'Unlimited API access',
      '24/7 dedicated support',
      'Unlimited requests',
      'Advanced analytics',
      'Custom integrations',
      'SLA guarantee',
      'White-label options'
    ]
  }
]