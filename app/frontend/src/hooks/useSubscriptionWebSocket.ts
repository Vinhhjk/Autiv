import { useEffect, useMemo, useRef } from 'react';
import { monadWebSocket, type SubscriptionEvent } from '../services/websocket';
import { addressMatches } from '../utils/contractEvents';

export interface SubscriptionWebSocketCallbacks {
  onPaymentProcessed?: (user: string, amount: string, timestamp: number) => void;
  onSubscriptionCreated?: (user: string, planId: string) => void;
  onSubscriptionCancelled?: (user: string) => void;
}

/**
 * Hook to listen for subscription-related WebSocket events for a specific user address
 */
export const useSubscriptionWebSocket = (
  userAddress: string | undefined,
  callbacks: SubscriptionWebSocketCallbacks,
  subscriptionManagerAddresses: (string | undefined)[] = []
) => {
  const callbacksRef = useRef(callbacks);
  
  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const normalizedManagerAddresses = useMemo(() => {
    return Array.from(
      new Set(
        (subscriptionManagerAddresses || [])
          .filter((addr): addr is string => typeof addr === 'string' && addr.length > 0)
          .map((addr) => addr.toLowerCase())
      )
    );
  }, [subscriptionManagerAddresses]);

  useEffect(() => {
    monadWebSocket.setSubscriptionManagerAddresses(normalizedManagerAddresses);

    return () => {
      if (normalizedManagerAddresses.length) {
        monadWebSocket.setSubscriptionManagerAddresses([]);
      }
    };
  }, [normalizedManagerAddresses]);

  useEffect(() => {
    if (!userAddress) return;

    // Connect to websocket if not already connected
    if (!monadWebSocket.isConnected) {
      monadWebSocket.connect();
    }

    // Event handler that filters events for the specific user
    const handleSubscriptionEvent = (event: SubscriptionEvent) => {
      // Only process events for the specified user address
      if (!addressMatches(event.user, userAddress)) {
        return;
      }


      // Call appropriate callback based on event type
      switch (event.type) {
        case 'PaymentProcessed':
          if (callbacksRef.current.onPaymentProcessed && event.amount) {
            callbacksRef.current.onPaymentProcessed(
              event.user,
              event.amount,
              event.timestamp
            );
          }
          break;

        case 'SubscriptionCreated':
          if (callbacksRef.current.onSubscriptionCreated && event.planId) {
            callbacksRef.current.onSubscriptionCreated(
              event.user,
              event.planId
            );
          }
          break;

        case 'SubscriptionCancelled':
          if (callbacksRef.current.onSubscriptionCancelled) {
            callbacksRef.current.onSubscriptionCancelled(event.user);
          }
          break;

        default:
          console.log('Unhandled event type:', event.type);
      }
    };

    // Add event listeners
    monadWebSocket.addEventListener('PaymentProcessed', handleSubscriptionEvent);
    monadWebSocket.addEventListener('SubscriptionCreated', handleSubscriptionEvent);
    monadWebSocket.addEventListener('SubscriptionCancelled', handleSubscriptionEvent);


    // Cleanup function
    return () => {
      monadWebSocket.removeEventListener('PaymentProcessed', handleSubscriptionEvent);
      monadWebSocket.removeEventListener('SubscriptionCreated', handleSubscriptionEvent);
      monadWebSocket.removeEventListener('SubscriptionCancelled', handleSubscriptionEvent);
      
    };
  }, [userAddress]);

  // Return connection status and control functions
  return {
    isConnected: monadWebSocket.isConnected,
    connect: () => monadWebSocket.connect(),
    disconnect: () => monadWebSocket.disconnect()
  };
};
