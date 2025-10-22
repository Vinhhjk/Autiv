// Contract ABIs and Addresses
import SubscriptionManagerABI from './SubscriptionManager.json'
import MockUSDCABI from './MockUSDC.json'

// Contract configurations for easy use in components
export const CONTRACTS = {
  SubscriptionManager: {
    abi: SubscriptionManagerABI.abi,
  },
  MockUSDC: {
    abi: MockUSDCABI.abi,
  }
}

export { SubscriptionManagerABI, MockUSDCABI }


