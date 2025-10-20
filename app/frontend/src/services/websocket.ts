/**
 * Monad Blockchain WebSocket Service
 * Listens for real-time blockchain events and subscription updates
 */

import { EVENT_SIGNATURES, SIGNATURE_TO_EVENT, decodeEventData } from '../utils/contractEvents';

export interface SubscriptionEvent {
  type: 'SubscriptionCreated' | 'SubscriptionCancelled' | 'PaymentProcessed';
  user: string;
  planId?: string;
  amount?: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
}

export interface WebSocketConfig {
  url: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

class MonadWebSocketService {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private eventListeners: Map<string, Set<(event: SubscriptionEvent) => void>> = new Map();
  private isConnecting = false;
  private subscriptionManagerAddresses: `0x${string}`[] = [];

  constructor(config: WebSocketConfig) {
    this.config = config;
    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    this.eventListeners.set('SubscriptionCreated', new Set());
    this.eventListeners.set('SubscriptionCancelled', new Set());
    this.eventListeners.set('PaymentProcessed', new Set());
  }

  /**
   * Connect to Monad WebSocket
   */
  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.config.url);
      
      this.ws.onopen = () => {
        console.log('Connected to Monad WebSocket');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.subscribeToContractEvents();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        this.isConnecting = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Subscribe to contract events
   */
  private subscribeToContractEvents() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const addresses = this.subscriptionManagerAddresses;
    if (!addresses.length) {
      console.warn('No subscription manager addresses configured for WebSocket subscription');
      return;
    }

    // Subscribe to SubscriptionManager contract events
    const subscriptionRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_subscribe',
      params: [
        'logs',
        {
          address: addresses,
          topics: [
            [
              // Event signatures for the events we care about
              EVENT_SIGNATURES.SubscriptionCreated,
              EVENT_SIGNATURES.SubscriptionCancelled,
              EVENT_SIGNATURES.PaymentProcessed
            ]
          ]
        }
      ]
    };

    this.ws.send(JSON.stringify(subscriptionRequest));
    console.log('Subscribed to SubscriptionManager events');
  }


  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string) {
    try {
      const message = JSON.parse(data);
      
      // Handle subscription confirmation
      if (message.method === 'eth_subscription') {
        this.processLogEvent(message.params.result);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }

  /**
   * Process blockchain log events
   */
  private processLogEvent(log: { topics: string[]; data: string; blockNumber: string; transactionHash: string }) {
    try {
      const eventType = SIGNATURE_TO_EVENT[log.topics[0]];
      if (!eventType || !['SubscriptionCreated', 'SubscriptionCancelled', 'PaymentProcessed'].includes(eventType)) {
        return;
      }

      // Decode event data using utility function
      const decodedData = decodeEventData(eventType, log.topics, log.data);

      const event: SubscriptionEvent = {
        type: eventType as SubscriptionEvent['type'],
        user: decodedData.user || '',
        planId: decodedData.planId,
        amount: decodedData.amount,
        timestamp: Date.now(),
        blockNumber: parseInt(log.blockNumber, 16),
        transactionHash: log.transactionHash
      };

      console.log('Received blockchain event:', event);
      this.emitEvent(eventType as SubscriptionEvent['type'], event);

    } catch (error) {
      console.error('Error processing log event:', error);
    }
  }


  /**
   * Emit event to listeners
   */
  private emitEvent(eventType: SubscriptionEvent['type'], event: SubscriptionEvent) {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  /**
   * Add event listener
   */
  addEventListener(eventType: SubscriptionEvent['type'], listener: (event: SubscriptionEvent) => void) {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.add(listener);
    }
  }

  /**
   * Remove event listener
   */
  removeEventListener(eventType: SubscriptionEvent['type'], listener: (event: SubscriptionEvent) => void) {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  setSubscriptionManagerAddresses(addresses: string[]) {
    const normalized = Array.from(
      new Set(
        (addresses || [])
          .filter((addr): addr is string => Boolean(addr))
          .map((addr) => addr.toLowerCase())
      )
    ) as `0x${string}`[];

    const hasChanged =
      normalized.length !== this.subscriptionManagerAddresses.length ||
      normalized.some((addr, index) => addr !== this.subscriptionManagerAddresses[index]);

    if (!hasChanged) {
      return;
    }

    this.subscriptionManagerAddresses = normalized;

    if (this.ws) {
      this.disconnect();
      if (this.subscriptionManagerAddresses.length > 0) {
        this.connect();
      }
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }

  /**
   * Get connection status
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
const websocketConfig: WebSocketConfig = {
  url: 'wss://testnet-rpc.monad.xyz', // Monad testnet WebSocket URL
  reconnectInterval: 5000, // 5 seconds
  maxReconnectAttempts: 10
};

export const monadWebSocket = new MonadWebSocketService(websocketConfig);
export default monadWebSocket;
