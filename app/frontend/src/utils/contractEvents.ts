/**
 * Contract Event Utilities
 * Handles event signature generation and parsing for blockchain events
 */

import { keccak256, toUtf8Bytes } from 'ethers';

/**
 * Generate keccak256 hash for event signature
 */
export function getEventSignature(signature: string): string {
  return keccak256(toUtf8Bytes(signature));
}

/**
 * Event signatures for SubscriptionManager contract
 */
export const EVENT_SIGNATURES = {
  SubscriptionCreated: getEventSignature('SubscriptionCreated(address,uint256,uint256)'),
  SubscriptionCancelled: getEventSignature('SubscriptionCancelled(address)'),
  PaymentProcessed: getEventSignature('PaymentProcessed(address,uint256,uint256)'),
  PlanCreated: getEventSignature('PlanCreated(uint256,uint256,address,uint256)'),
  PlanUpdated: getEventSignature('PlanUpdated(uint256,bool)'),
  ExecutorAuthorized: getEventSignature('ExecutorAuthorized(address,bool)')
};

/**
 * Reverse mapping for event identification
 */
export const SIGNATURE_TO_EVENT = Object.entries(EVENT_SIGNATURES).reduce(
  (acc, [eventName, signature]) => {
    acc[signature] = eventName as keyof typeof EVENT_SIGNATURES;
    return acc;
  },
  {} as Record<string, keyof typeof EVENT_SIGNATURES>
);

/**
 * Decode event data based on event type
 */
export function decodeEventData(eventType: string, topics: string[], data: string) {
  switch (eventType) {
    case 'SubscriptionCreated':
      return {
        user: '0x' + topics[1]?.slice(26), // indexed address
        planId: decodeUint256(data, 0),
        timestamp: decodeUint256(data, 32)
      };
    
    case 'SubscriptionCancelled':
      return {
        user: '0x' + topics[1]?.slice(26) // indexed address
      };
    
    case 'PaymentProcessed':
      return {
        user: '0x' + topics[1]?.slice(26), // indexed address
        amount: decodeUint256(data, 0),
        timestamp: decodeUint256(data, 32)
      };
    
    case 'PlanCreated':
      return {
        planId: decodeUint256(data, 0),
        price: decodeUint256(data, 32),
        tokenAddress: '0x' + data.slice(90, 130), // address is 20 bytes
        periodSeconds: decodeUint256(data, 96)
      };
    
    case 'PlanUpdated':
      return {
        planId: decodeUint256(data, 0),
        isActive: data.slice(66, 67) === '1' // boolean
      };
    
    case 'ExecutorAuthorized':
      return {
        executor: '0x' + topics[1]?.slice(26), // indexed address
        authorized: data.slice(66, 67) === '1' // boolean
      };
    
    default:
      return {};
  }
}

/**
 * Decode uint256 from hex data
 */
function decodeUint256(data: string, offset: number): string {
  const hex = data.slice(2 + offset * 2, 2 + (offset + 32) * 2);
  return BigInt('0x' + hex).toString();
}

/**
 * Check if address matches (case insensitive)
 */
export function addressMatches(address1: string, address2: string): boolean {
  return address1.toLowerCase() === address2.toLowerCase();
}
