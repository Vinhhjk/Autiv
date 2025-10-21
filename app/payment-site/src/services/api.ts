/**
 * Authenticated API Service for Autiv Frontend
 * Handles all API calls directly to Cloudflare Worker
 */

const API_BASE_URL = import.meta.env.VITE_WORKER_URL

// Generate cryptographically secure nonce
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}


interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
}

interface UserInfo {
  wallet_address: string;
  smart_account_address: string;
  email: string;
}

interface TokenMetadata {
  id: string
  name: string
  symbol: string
  token_address: string
}

interface Project {
  id: string;
  name: string;
  description: string;
  subscription_manager_address: string;
  supported_token?: TokenMetadata | null;
}

interface ApiKey {
  id: string;
  key_value: string;
  name: string;
  description: string;
  is_active: boolean;
}

interface Subscription {
  plan_id: string;
  plan_name: string;
  company_name: string;
  status: string;
  start_date: number;
  next_payment_date?: number;
  last_payment_date?: number;
  cancelled_at?: number;
  subscription_manager_address?: string;
  price?: number;
  token_symbol?: string;
  token_address?: string;
}


interface Developer {
  wallet_address: string;
  smart_account_address?: string;
  display_name?: string;
  email?: string;
  company_name?: string;
  website_url?: string;
  logo_url?: string;
  description?: string;
  is_verified?: boolean;
  is_active?: boolean;
  api_key?: string;
}

interface SubscriptionPlan {
  id: string;
  developer_id: string;
  contract_plan_id: number;
  name: string;
  price: number;
  token_address: string;
  token_symbol?: string;
  period_seconds: number;
  is_active?: boolean;
}

interface UserSubscriptionData {
  subscriptions: Subscription[];
}

export type PaymentSessionStatus = 'pending' | 'processing' | 'paid' | 'expired'

export interface PaymentSession {
  paymentId: string
  status: PaymentSessionStatus
  createdAt: number
  updatedAt: number
  expiresAt: number
  paidAt: number | null
  planId: string
  contractPlanId: number
  planName: string
  companyName: string | null
  planDescription: string | null
  amount: number
  tokenSymbol: string
  tokenAddress: string
  billingIntervalSeconds: number
  billingIntervalText: string
  metadata: Record<string, unknown>
  txHash: string | null
}


interface ContractSyncData {
  subscriptions?: UserSubscriptionData[];
  developers?: Developer[];
}

class ApiService {
  private getIdentityToken?: () => Promise<string | null>

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    headers: Record<string, string> = {},
    requiresAuth = true
  ): Promise<ApiResponse<T>> {
    try {
      const optionHeaders = options.headers
        ? Object.fromEntries(new Headers(options.headers as HeadersInit).entries())
        : {};

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...optionHeaders,
        ...headers,
      };

      const usesApiKey = Boolean(requestHeaders["X-Api-Key"]);

      // Add Privy JWT for authentication (unless using API key)
      if (!usesApiKey && requiresAuth) {
        const privyToken = await this.getIdentityToken?.();
        if (!privyToken) {
          console.warn("Skipping authenticated headers: Privy token unavailable");
        } else {
          requestHeaders.Authorization = `Bearer ${privyToken}`;
        }
      }

      // Parse existing body or create new one
      let bodyData: Record<string, unknown> = {};
      if (options.body && typeof options.body === 'string') {
        try {
          bodyData = JSON.parse(options.body);
        } catch {
          // Body is not JSON
        }
      }

      // Add timestamp and nonce for replay protection
      if (!usesApiKey && requiresAuth) {
        bodyData.timestamp = Date.now();
        bodyData.nonce = generateNonce();
      }

      const requestOptions: RequestInit = {
        ...options,
        method: options.method || 'POST',
        headers: requestHeaders,
        body: Object.keys(bodyData).length > 0 ? JSON.stringify(bodyData) : options.body,
      };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, requestOptions);
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText;
      }

      if (!response.ok) {
        console.error("API request failed:", {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          error: data.error || data,
          responseText
        });
        return {
          success: false,
          error:
            data.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error("API call failed with exception:", {
        endpoint,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "API server unavailable",
      };
    }
  }

  configureAuth(getToken: () => string | null | Promise<string | null>) {
    this.getIdentityToken = () => Promise.resolve(getToken()).then((value) => value ?? null)
  }

  clearAuth() {
    // Clear any cached data if needed
  }

  /**
   * Verify developer API key
   */
  async verifyApiKey(apiKey: string): Promise<ApiResponse<{ valid: boolean }>> {
    return this.makeRequest(
      "/api/verify-key",
      {
        method: "POST",
        body: "",
      },
      {
        "X-Api-Key": apiKey,
      }
    );
  }

  /**
   * Get user information by email
   */
  async getUserInfo(): Promise<ApiResponse<{ found: boolean; user?: UserInfo }>> {
    const result = await this.makeRequest<{ found: boolean; user?: UserInfo }>(
      "/api/get-user-info",
      {
        method: "POST",
        body: "",
      }
    );

    // Handle 404 as "user not found" (success case)
    if (!result.success && result.error?.includes("404")) {
      return {
        success: true,
        data: { found: false },
      };
    }

    return result;
  }

  /**
   * Create new user
   */
  async createUser(userData: {
    email: string;
    wallet_address: string;
    smart_account_address?: string;
  }): Promise<ApiResponse<UserInfo>> {
    return this.makeRequest("/api/create-user", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  /**
   * Get user subscriptions by email
   */
  async getUserSubscriptions(): Promise<ApiResponse<{ subscriptions: Subscription[] }>> {
    return this.makeRequest(
      "/api/get-user-subscriptions",
      {
        method: "POST",
        body: "",
      }
    );
  }

  /**
   * Sync contract data with database
   */
  async syncContractData(
    syncData: ContractSyncData
  ): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return this.makeRequest("/api/sync-contract-data", {
      method: "POST",
      body: JSON.stringify(syncData),
    });
  }

  /**
   * Create a new project
   */
  async createProject(projectData: {
    developer_email: string;
    name: string;
    description: string;
    subscription_manager_address: string;
    token_address: string;
    token_name?: string;
    token_symbol?: string;
  }): Promise<ApiResponse<{ project: Project }>> {
    return this.makeRequest("/api/create-project", {
      method: "POST",
      body: JSON.stringify(projectData),
    });
  }

  /**
   * Get developer's projects
   */
  async getDeveloperProjects(): Promise<ApiResponse<{ projects: Project[] }>> {
    return this.makeRequest(
      "/api/get-developer-projects",
      {
        method: "POST",
        body: "",
      }
    );
  }

  /**
   * Create API key for a project
   */
  async createApiKey(keyData: {
    developer_email: string;
    project_id: string;
    name: string;
    description: string;
  }): Promise<ApiResponse<{ api_key: ApiKey }>> {
    return this.makeRequest("/api/create-api-key", {
      method: "POST",
      body: JSON.stringify(keyData),
    });
  }

  /**
   * Create API key for a developer (not tied to specific project)
   */
  async createDeveloperApiKey(keyData: {
    developer_email: string;
    name: string;
    description: string;
  }): Promise<ApiResponse<{ api_key: ApiKey }>> {
    return this.makeRequest("/api/create-developer-api-key", {
      method: "POST",
      body: JSON.stringify(keyData),
    });
  }

  /**
   * Get user delegation for a subscription
   * Returns the complete delegation object as stored in the database
   */
  async getUserDelegation(data: {
    user_smart_account: string;
    subscription_manager_address: string;
  }): Promise<ApiResponse<{ 
    delegation: {
      delegate: `0x${string}`;
      delegator: `0x${string}`;
      authority: `0x${string}`;
      caveats: Array<{
        enforcer: `0x${string}`;
        terms: `0x${string}`;
        args: `0x${string}`;
      }>;
      salt: `0x${string}`;
      signature: `0x${string}`;
    }
  }>> {
    return this.makeRequest("/api/get-user-delegation", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Create subscription plan
   */
  async createSubscriptionPlan(planData: {
    developer_email: string;
    project_id: string;
    contract_plan_id: number;
    name: string;
    price: number;
    token_address: string;
    period_seconds: number;
  }): Promise<ApiResponse<{ plan: SubscriptionPlan }>> {
    return this.makeRequest("/api/create-subscription-plan", {
      method: "POST",
      body: JSON.stringify(planData),
    });
  }

  async createPaymentSession(payload: {
    project_id: string
    contract_plan_id: number
    metadata?: Record<string, unknown>
    delegation_data?: Record<string, unknown>
  }): Promise<ApiResponse<{ session: PaymentSession }>> {
    return this.makeRequest("/api/create-payment-session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getPaymentSession(paymentId: string): Promise<ApiResponse<{ session: PaymentSession }>> {
    return this.makeRequest("/api/get-payment-session", {
      method: "POST",
      body: JSON.stringify({ payment_id: paymentId }),
    }, {}, false);
  }

  async updatePaymentSession(payload: {
    payment_id: string
    status: PaymentSessionStatus
    tx_hash?: string
    metadata?: Record<string, unknown>
  }): Promise<ApiResponse<{ session: PaymentSession }>> {
    return this.makeRequest("/api/update-payment-session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Get developer's API keys
   */
  async getDeveloperApiKeys(): Promise<ApiResponse<{ api_keys: ApiKey[] }>> {
    return this.makeRequest(
      "/api/get-developer-api-keys",
      {
        method: "POST",
        body: "",
      }
    );
  }

  /**
   * Get project details with subscription plans
   */
  async getProjectDetails(
    projectId: string
  ): Promise<ApiResponse<{ project: Project; subscription_plans: SubscriptionPlan[] }>> {
    return this.makeRequest(
      "/api/get-project-details",
      {
        method: "POST",
        body: "",
        headers: {
          "X-Project-Id": projectId,
        },
      }
    );
  }

  /**
   * Create subscription and optionally record payment in single API call
   */
  async createSubscription(subscriptionData: {
    user_email: string;
    user_wallet_address: string;
    user_smart_account_address?: string;
    plan_id: number;
    project_id: string;
    tx_hash?: string;
    start_date: number;
    subscription_manager_address: string;
    amount?: number;
    token_address: string;
    payment_date?: number;
    delegation_data?: Record<string, unknown>;
  }): Promise<ApiResponse<{ success: boolean; message: string; subscription_id?: string; payment_id?: string }>> {
    return this.makeRequest("/api/create-subscription", {
      method: "POST",
      body: JSON.stringify(subscriptionData),
    });
  }

  /**
   * Cancel subscription after blockchain transaction
   */
  async cancelSubscription(cancellationData: {
    user_email: string;
    user_wallet_address: string;
    user_smart_account_address?: string;
    plan_id?: string;
    tx_hash?: string;
    subscription_manager_address?: string;
    delegation?: unknown;
  }): Promise<ApiResponse<{ message: string }>> {
    return this.makeRequest(`/api/cancel-subscription`, {
      method: "POST",
      body: JSON.stringify(cancellationData),
    });
  }

  /**
   * Create developer profile
   */
  async createDeveloper(developerData: {
    email: string;
    wallet_address: string;
    smart_account_address?: string;
    display_name: string;
    company_name: string;
    website_url?: string;
    logo_url?: string;
    description: string;
  }): Promise<ApiResponse<{ developer: Developer }>> {
    return this.makeRequest("/api/create-developer", {
      method: "POST",
      body: JSON.stringify(developerData),
    });
  }

  /**
   * Get developer information by email
   */
  async getDeveloperInfo(): Promise<ApiResponse<{ found: boolean; developer?: Developer }>> {
    return this.makeRequest(
      "/api/get-developer-info",
      {
        method: "POST",
        body: "",
      }
    );
  }

}

export const apiService = new ApiService();
export type {
  ApiResponse,
  UserInfo,
  Subscription,
  ContractSyncData,
  Developer,
  SubscriptionPlan,
  UserSubscriptionData,
  Project,
  ApiKey,
};
