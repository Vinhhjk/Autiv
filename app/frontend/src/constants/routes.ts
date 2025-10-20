// Export individual route paths for easy navigation
export const routes = {
  home: '/',
  demo: '/demo',
  docs: '/docs',
  userHome: '/home',
  userHomeManageSubscription: '/home/manage-subscription',
  userHomeAnalytics: '/home/analytics', 
  userHomeDevelopers: '/home/developers',
  developers: '/developers',
  projectDetail: '/projects'
} as const

// Type for route paths
export type RoutePath = typeof routes[keyof typeof routes]