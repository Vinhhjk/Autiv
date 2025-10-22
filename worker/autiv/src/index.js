/**
 * Cloudflare Worker for Autiv API
 * Handles Privy JWT authentication and routes requests to Xata database
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

const SUBSCRIPTION_MANAGER_DEPLOYED_TOPIC = "0x38db265c0cf2a33c417051a7d0943e38a02b3db9f988689dd670bf6a1aa5e0cd";
const PLAN_CREATED_TOPIC = "0x9e577f4ac885b769646db304f554e3503ca6b65d2bf0dc1aab2d40f42dca44d5";

const NONCE_TTL_MS = 2 * 60 * 1000;

// Durable Object for nonce management
export class NonceManager {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const nonce = url.searchParams.get('nonce');

    switch (action) {
      case 'check':
        return this.checkNonce(nonce);
      case 'reserve':
        return this.reserveNonce(nonce);
      default:
        return new Response('Invalid action', { status: 400 });
    }
  }

  async checkNonce(nonce) {
    if (!nonce) {
      return new Response(JSON.stringify({ success: false, error: 'missing_nonce' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const exists = Boolean(await this.state.storage.get(nonce));
    return new Response(JSON.stringify({ exists }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async reserveNonce(nonce) {
    if (!nonce) {
      return new Response(JSON.stringify({ success: false, reason: 'missing_nonce' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const existing = await this.state.storage.get(nonce);
    if (existing) {
      return new Response(JSON.stringify({ success: false, reason: 'nonce_exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const expiresAt = Date.now() + NONCE_TTL_MS;
    await this.state.storage.put(nonce, true, {
      expiration: Math.floor(expiresAt / 1000)
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

const PAYMENT_SESSION_WINDOW_MS = 5 * 60 * 1000;
const PAYMENT_SESSION_STORAGE_BUFFER_MS = 10 * 60 * 1000;
const PAYMENT_SESSION_FINALIZED_RETENTION_MS = 2 * 60 * 1000;
const ALLOWED_PAYMENT_SESSION_STATUSES = new Set(['pending', 'processing', 'paid', 'expired']);

function computePaymentSessionExpirationTimestamp(session) {
  const now = Date.now();

  if (session.status === 'paid' || session.status === 'expired') {
    const base = session.paidAt || session.updatedAt || now;
    return base + PAYMENT_SESSION_FINALIZED_RETENTION_MS;
  }

  const expiresAt = session.expiresAt || ((session.updatedAt || now) + PAYMENT_SESSION_WINDOW_MS);
  return Math.max(expiresAt, now) + PAYMENT_SESSION_STORAGE_BUFFER_MS;
}

export class PaymentSessionManager {
  constructor(state) {
    this.state = state;
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'create':
        return this.createSession(request);
      case 'get':
        return this.getSession(url.searchParams.get('paymentId'));
      case 'update':
        return this.updateSession(request);
      default:
        return new Response(JSON.stringify({ success: false, error: 'invalid_action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  }

  async createSession(request) {
    try {
      const body = await request.json();
      const session = body?.session;

      if (!session || !session.paymentId) {
        return new Response(JSON.stringify({ success: false, error: 'missing_session' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const now = Date.now();
      session.createdAt = session.createdAt || now;
      session.updatedAt = now;
      session.expiresAt = session.expiresAt || (now + PAYMENT_SESSION_WINDOW_MS);
      session.status = ALLOWED_PAYMENT_SESSION_STATUSES.has(session.status) ? session.status : 'pending';
      session.metadata = session.metadata && typeof session.metadata === 'object' ? session.metadata : {};

      await this.storeSession(session.paymentId, session);

      return new Response(JSON.stringify({ success: true, session }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error?.message || 'create_failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async getSession(paymentId) {
    if (!paymentId) {
      return new Response(JSON.stringify({ success: false, error: 'missing_payment_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const session = await this.state.storage.get(paymentId);
    if (!session) {
      return new Response(JSON.stringify({ success: false, error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = Date.now();
    if (session.status !== 'paid' && now >= session.expiresAt) {
      session.status = 'expired';
      session.updatedAt = now;
      session.expiresAt = now;
      await this.storeSession(paymentId, session);
    }

    return new Response(JSON.stringify({ success: true, session }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async updateSession(request) {
    try {
      const body = await request.json();
      const paymentId = body?.paymentId;
      if (!paymentId) {
        return new Response(JSON.stringify({ success: false, error: 'missing_payment_id' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const session = await this.state.storage.get(paymentId);
      if (!session) {
        return new Response(JSON.stringify({ success: false, error: 'not_found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const now = Date.now();
      const requestedStatus = body?.status;

      if (requestedStatus && !ALLOWED_PAYMENT_SESSION_STATUSES.has(requestedStatus)) {
        return new Response(JSON.stringify({ success: false, error: 'invalid_status' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (session.status !== 'paid' && now >= session.expiresAt && requestedStatus !== 'paid') {
        session.status = 'expired';
        session.updatedAt = now;
        session.expiresAt = now;
        await this.storeSession(paymentId, session);
        return new Response(JSON.stringify({ success: true, session }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (requestedStatus) {
        session.status = requestedStatus;
        if (requestedStatus === 'paid') {
          session.paidAt = now;
          session.expiresAt = session.expiresAt || now;
        }
      }

      if (body?.txHash) {
        session.txHash = body.txHash;
      }

      if (body?.metadata && typeof body.metadata === 'object') {
        session.metadata = {
          ...(session.metadata || {}),
          ...body.metadata,
        };
      }

      session.updatedAt = now;
      await this.storeSession(paymentId, session);

      return new Response(JSON.stringify({ success: true, session }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error?.message || 'update_failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async storeSession(paymentId, session) {
    const expiration = computePaymentSessionExpirationTimestamp(session);
    await this.state.storage.put(paymentId, session, {
      expiration: Math.floor(expiration / 1000)
    });

    const alarmAt = Math.max(Date.now() + 1000, expiration);
    await this.state.storage.setAlarm(alarmAt);
  }
}

const getConfig = (env) => ({
    DATABASE_URL_HTTPS: env.DATABASE_URL_HTTPS,
    PRIVY_APP_ID: env.PRIVY_APP_ID,
    PRIVY_JWKS_URL: env.PRIVY_JWKS_URL || `https://auth.privy.io/api/v1/apps/${env.PRIVY_APP_ID}/jwks.json`,
  });

// Cache for Privy JWKS
let privyJwksCache = null;
function getPrivyJwks(env) {
  if (!privyJwksCache) {
    const config = getConfig(env);
    privyJwksCache = createRemoteJWKSet(new URL(config.PRIVY_JWKS_URL));
  }
  return privyJwksCache;
}

const randomBytes = (length = 16) => {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
};

function generatePaymentSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = randomBytes(16);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Nonce Management with Durable Objects ---
async function checkNonce(nonce, env) {
  const id = env.NONCE_MANAGER.idFromName("global");
  const stub = env.NONCE_MANAGER.get(id);
  const response = await stub.fetch(`https://nonce-manager/?action=check&nonce=${encodeURIComponent(nonce)}`);
  const result = await response.json();
  return result.exists;
}

async function reserveNonce(nonce, env) {
  const id = env.NONCE_MANAGER.idFromName("global");
  const stub = env.NONCE_MANAGER.get(id);
  const response = await stub.fetch(`https://nonce-manager/?action=reserve&nonce=${encodeURIComponent(nonce)}`);
  const result = await response.json();
  return result.success;
}

async function createPaymentSessionDO(session, env) {
  if (!env.PAYMENT_SESSION_MANAGER || !env.PAYMENT_SESSION_MANAGER.idFromName) {
    throw new Error('PAYMENT_SESSION_MANAGER Durable Object binding is not configured');
  }
  const id = env.PAYMENT_SESSION_MANAGER.idFromName(session.paymentId);
  const stub = env.PAYMENT_SESSION_MANAGER.get(id);
  const response = await stub.fetch('https://payment-session/?action=create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session })
  });
  const json = await response.json();
  return { ok: response.ok, status: response.status, data: json };
}

async function getPaymentSessionDO(paymentId, env) {
  const id = env.PAYMENT_SESSION_MANAGER.idFromName(paymentId);
  const stub = env.PAYMENT_SESSION_MANAGER.get(id);
  const response = await stub.fetch(`https://payment-session/?action=get&paymentId=${encodeURIComponent(paymentId)}`);
  const json = await response.json();
  return { ok: response.ok, status: response.status, data: json };
}

async function updatePaymentSessionDO(updateData, env) {
  const paymentId = updateData?.paymentId;
  if (!paymentId) {
    return { success: false, error: 'missing_payment_id' };
  }
  const id = env.PAYMENT_SESSION_MANAGER.idFromName(paymentId);
  const stub = env.PAYMENT_SESSION_MANAGER.get(id);
  const response = await stub.fetch('https://payment-session/?action=update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData)
  });
  const json = await response.json();
  return { ok: response.ok, status: response.status, data: json };
}

async function getPlanDetailsForPaymentSession(xataApiKey, projectId, contractPlanId, env) {
  const response = await xataRequest("tables/subscription_plans/query", {
    method: "POST",
    body: JSON.stringify({
      columns: [
        "id",
        "name",
        "price",
        "period_seconds",
        "contract_plan_id",
        "developer_id.company_name",
        "project_id",
        "project_id.subscription_manager_address",
        "project_id.supported_token_id.token_address",
        "project_id.supported_token_id.symbol"
      ],
      filter: {
        project_id: projectId,
        contract_plan_id: contractPlanId
      },
      page: { size: 1 }
    })
  }, xataApiKey, env);

  if (!response.records || response.records.length === 0) {
    return null;
  }

  return response.records[0];
}

function formatBillingInterval(seconds) {
  if (!seconds || Number.isNaN(seconds)) {
    return 'Every period';
  }
  if (seconds < 60) {
    return `Every ${seconds} seconds`;
  }
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return days === 1 ? 'Every day' : `Every ${days} days`;
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`;
  }
  return `Every ${seconds} seconds`;
}

function sanitizePaymentSessionForClient(session) {
  if (!session) return null;
  return {
    paymentId: session.paymentId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    paidAt: session.paidAt || null,
    planId: session.planId,
    contractPlanId: session.contractPlanId,
    planName: session.planName,
    companyName: session.companyName,
    planDescription: session.planDescription,
    amount: session.amount,
    tokenSymbol: session.tokenSymbol,
    tokenAddress: session.tokenAddress,
    billingIntervalSeconds: session.billingIntervalSeconds,
    billingIntervalText: session.billingIntervalText,
    metadata: session.metadata || {},
    txHash: session.txHash || null
  };
}

// --- Blockchain Transaction Verification ---
async function verifyBlockchainTransaction(tx_hash, expected_user, expected_smart_account, expected_plan_id, subscription_manager_address, env) {
  try {
    // Get transaction receipt from blockchain using Hypersync RPC
    const rpcUrl = `https://monad-testnet.rpc.hypersync.xyz/${env.HYPERSYNC_API}`;
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [tx_hash],
        id: 1
      })
    });
    
    const result = await response.json();
    
    // Check if transaction exists
    if (!result.result) {
      return { valid: false, error: "Transaction not found on blockchain" };
    }
    
    const receipt = result.result;
    
    // Check if transaction was successful (status = 0x1)
    if (receipt.status !== '0x1') {
      return { valid: false, error: "Transaction failed on blockchain" };
    }
    
    // Validate subscription_manager_address is provided
    if (!subscription_manager_address) {
      return { valid: false, error: "Subscription manager address not provided" };
    }
    
    const SUBSCRIPTION_MANAGER_ADDRESS = subscription_manager_address;
    
    // Check if transaction has logs (events were emitted)
    if (!receipt.logs || receipt.logs.length === 0) {
      return { valid: false, error: "No events found in transaction" };
    }
    
    // Verify that at least one log is from the SubscriptionManager contract
    const hasSubscriptionManagerLog = receipt.logs.some(log => 
      log.address.toLowerCase() === SUBSCRIPTION_MANAGER_ADDRESS.toLowerCase()
    );
    
    if (!hasSubscriptionManagerLog) {
      console.log('No logs from SubscriptionManager. Found logs from:', 
        receipt.logs.map(log => log.address).join(', ')
      );
      return { 
        valid: false, 
        error: `No events from SubscriptionManager contract (${SUBSCRIPTION_MANAGER_ADDRESS})` 
      };
    }
    
    console.log('Transaction verified:', {
      txHash: tx_hash,
      status: receipt.status,
      logsCount: receipt.logs.length,
      subscriptionManagerLogs: receipt.logs.filter(log => 
        log.address.toLowerCase() === SUBSCRIPTION_MANAGER_ADDRESS.toLowerCase()
      ).length
    });
    
    return { valid: true };
    
  } catch (error) {
    console.error('Blockchain verification error:', error);
    return { valid: false, error: "Failed to verify blockchain transaction: " + error.message };
  }
}

// --- JWT Verification ---
async function verifyPrivyJwt(token, env) {
  try {
    const jwks = getPrivyJwks(env);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: 'privy.io',
      audience: env.PRIVY_APP_ID,
    });
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

function extractEmailFromPrivyPayload(payload) {
  if (!payload) return null;

  // Check direct email field (most common)
  if (payload.email) {
    if (typeof payload.email === 'string') return payload.email;
    if (payload.email?.address) return payload.email.address;
  }

  // Check google email
  if (payload.google?.email) return payload.google.email;

  // Check linked accounts (Privy returns this as a JSON string!)
  let linkedAccounts = payload.linked_accounts;
  
  // Parse if it's a string
  if (typeof linkedAccounts === 'string') {
    try {
      linkedAccounts = JSON.parse(linkedAccounts);
    } catch (e) {
      // Silent fail - will return null below
    }
  }
  
  if (Array.isArray(linkedAccounts)) {
    // Try email account first
    const emailAccount = linkedAccounts.find(acct => acct?.type === 'email' && acct?.address);
    if (emailAccount) return emailAccount.address;
    
    // Try google oauth account
    const googleAccount = linkedAccounts.find(acct => acct?.type === 'google_oauth' && acct?.email);
    if (googleAccount) return googleAccount.email;
  }

  return null;
}

// --- Request handler ---
async function handleRequest(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Timestamp, X-Request-Nonce, X-User-Email, X-Api-Key, X-Project-Id',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 1. Check for Developer API Key
  const devApiKey = req.headers.get("X-Api-Key") || url.searchParams.get("api_key");
  if (devApiKey) {
    const valid = await verifyApiKey(env.XATA_API_KEY, devApiKey, env);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), { 
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  const publicEndpoints = new Set([
    '/api/get-payment-session'
  ]);

  const requiresAuth = !devApiKey && !publicEndpoints.has(path);
  let userEmail = null;

  if (requiresAuth) {
    // 2. Otherwise expect JWT from frontend
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { 
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const token = authHeader.slice('Bearer '.length);

    // Verify JWT
    const payload = await verifyPrivyJwt(token, env);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid or expired JWT" }), { 
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    userEmail = extractEmailFromPrivyPayload(payload);
    if (!userEmail) {
      return new Response(JSON.stringify({ error: "Unable to extract email from JWT" }), { 
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  // Read body once
  const bodyText = await req.text();
  let requestBody = {};
  if (bodyText) {
    try {
      requestBody = JSON.parse(bodyText);
    } catch (e) {
      // Body is not JSON, that's okay
    }
  }

  if (requiresAuth) {
    // 3. Check timestamp for replay protection
    const timestamp = requestBody.timestamp || Date.now();
    const now = Date.now();
    const ACCEPT_WINDOW = 60000; // 60 seconds
    if (Math.abs(now - timestamp) > ACCEPT_WINDOW) {
      return new Response(JSON.stringify({ error: "Request expired" }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 4. Check nonce for replay protection
    const nonce = requestBody.nonce;
    if (nonce) {
      const seen = await checkNonce(nonce, env);
      if (seen) {
        return new Response(JSON.stringify({ error: "Duplicate request detected" }), {
          status: 409,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Reserve nonce
      const reserved = await reserveNonce(nonce, env);
      if (!reserved) {
        return new Response(JSON.stringify({ error: "Failed to reserve nonce" }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
  }

  // Get developer info if needed
  let developerId = null;
  if (requiresAuth && userEmail) {
    try {
      const devInfo = await getDeveloperInfo(env.XATA_API_KEY, userEmail, env);
      if (devInfo.found && devInfo.developer?.id) {
        developerId = devInfo.developer.id;
      }
    } catch (err) {
      console.warn('Failed to fetch developer info:', err);
    }
  }

  // Create a new request with the body text for route handlers
  const newReq = new Request(req.url, {
    method: req.method,
    headers: new Headers({
      ...Object.fromEntries(req.headers.entries()),
      'X-User-Email': userEmail || '',
      'X-Developer-Id': developerId || '',
    }),
    body: bodyText || null
  });

  // Handle routes for frontend
  switch (path) {
      case "/api/verify-key":
        const targetApiKey = newReq.headers.get("X-Api-Key");
        const valid = await verifyApiKey(env.XATA_API_KEY, targetApiKey, env);
        return new Response(JSON.stringify({ valid }), {
          status: valid ? 200 : 401,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
        
      case "/api/get-user-info":
        const user_email = newReq.headers.get("X-User-Email");
        const userInfo = await getUserInfo(env.XATA_API_KEY, user_email, env);
        if (!userInfo) {
          return new Response(JSON.stringify({ found: false }), {
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            },
          });
        }
        return new Response(JSON.stringify({ found: true, user: userInfo }), {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/create-user":
        const createUserData = await newReq.json();
        const createdUser = await createUser(env.XATA_API_KEY, createUserData, env);
        if (!createdUser) {
          return new Response(JSON.stringify({ error: "Failed to create user" }), {
            status: 500,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            },
          });
        }
        return new Response(JSON.stringify(createdUser), {
          status: 201,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/get-user-subscriptions":
        const user_email_for_subs = newReq.headers.get("X-User-Email");
        const result = await getUserSubscriptions(env.XATA_API_KEY, user_email_for_subs, env);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/create-payment-session": {
        const projectId = requestBody.project_id || requestBody.projectId;
        const contractPlanRaw = requestBody.contract_plan_id ?? requestBody.contractPlanId ?? requestBody.plan_id ?? requestBody.planId;
        const contractPlanId = typeof contractPlanRaw === 'number' ? contractPlanRaw : parseInt(contractPlanRaw, 10);
        if (!projectId || Number.isNaN(contractPlanId)) {
          return new Response(JSON.stringify({ success: false, error: "missing_project_or_plan" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const planRecord = await getPlanDetailsForPaymentSession(env.XATA_API_KEY, projectId, contractPlanId, env);
        if (!planRecord) {
          return new Response(JSON.stringify({ success: false, error: "plan_not_found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const tokenAddress = planRecord.project_id?.supported_token_id?.token_address;
        const tokenSymbol = planRecord.project_id?.supported_token_id?.symbol;
        const subscriptionManagerAddress = planRecord.project_id?.subscription_manager_address;
        if (!tokenAddress || !tokenSymbol || !subscriptionManagerAddress) {
          return new Response(JSON.stringify({ success: false, error: "plan_missing_token_or_manager" }), {
            status: 422,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const userInfo = await getUserInfo(env.XATA_API_KEY, userEmail, env);
        const paymentId = generatePaymentSessionId();
        const now = Date.now();
        const session = {
          paymentId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          expiresAt: now + PAYMENT_SESSION_WINDOW_MS,
          userEmail,
          projectId,
          planId: planRecord.id,
          contractPlanId,
          planName: planRecord.name,
          companyName: planRecord.developer_id?.company_name || null,
          amount: typeof planRecord.price === 'number' ? planRecord.price : Number(planRecord.price || 0),
          billingIntervalSeconds: planRecord.period_seconds,
          billingIntervalText: formatBillingInterval(planRecord.period_seconds),
          tokenAddress,
          tokenSymbol,
          planDescription: planRecord.description || null,
          userWalletAddress: userInfo?.wallet_address || null,
          userSmartAccountAddress: userInfo?.smart_account_address || null,
          metadata: {
            projectId,
            subscription_manager_address: subscriptionManagerAddress
          }
        };

        if (requestBody.metadata && typeof requestBody.metadata === 'object') {
          session.metadata = {
            ...session.metadata,
            ...requestBody.metadata,
          };
        }

        if (requestBody.delegation_data && typeof requestBody.delegation_data === 'object') {
          session.metadata = {
            ...session.metadata,
            delegation_data: requestBody.delegation_data,
          };
        }

        const createResult = await createPaymentSessionDO(session, env);
        if (!createResult.ok || !createResult.data?.success) {
          return new Response(JSON.stringify(createResult.data || { success: false, error: "payment_session_create_failed" }), {
            status: createResult.status || 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        return new Response(JSON.stringify({ success: true, session: sanitizePaymentSessionForClient(createResult.data.session) }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      case "/api/get-payment-session": {
        const paymentId = requestBody.payment_id || requestBody.paymentId || newReq.headers.get('X-Payment-Id');
        if (!paymentId) {
          return new Response(JSON.stringify({ success: false, error: "missing_payment_id" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const sessionResult = await getPaymentSessionDO(paymentId, env);
        if (!sessionResult.ok || !sessionResult.data?.success) {
          return new Response(JSON.stringify(sessionResult.data || { success: false, error: "payment_session_not_found" }), {
            status: sessionResult.status || 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const session = sessionResult.data.session;
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: "payment_session_not_found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        if (userEmail && session.userEmail && session.userEmail !== userEmail) {
          return new Response(JSON.stringify({ success: false, error: "forbidden" }), {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        return new Response(JSON.stringify({ success: true, session: sanitizePaymentSessionForClient(session) }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      case "/api/update-payment-session": {
        const paymentId = requestBody.payment_id || requestBody.paymentId;
        const statusUpdate = requestBody.status;
        const txHash = requestBody.tx_hash || requestBody.txHash;

        if (!paymentId) {
          return new Response(JSON.stringify({ success: false, error: "missing_payment_id" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const sessionResult = await getPaymentSessionDO(paymentId, env);
        if (!sessionResult.ok || !sessionResult.data?.success) {
          return new Response(JSON.stringify(sessionResult.data || { success: false, error: "payment_session_not_found" }), {
            status: sessionResult.status || 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const session = sessionResult.data.session;

        if (session.status === 'paid') {
          const sanitized = sanitizePaymentSessionForClient(session)
          return new Response(JSON.stringify({ success: true, session: sanitized }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          })
        }

        if (statusUpdate === 'paid') {
          if (!txHash) {
            return new Response(JSON.stringify({ success: false, error: "missing_tx_hash" }), {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }

          const startDate = Math.floor(Date.now() / 1000);
          const subscriptionPayload = {
            user_email: userEmail,
            user_wallet_address: session.userWalletAddress,
            user_smart_account_address: session.userSmartAccountAddress,
            plan_id: session.contractPlanId,
            project_id: session.projectId,
            tx_hash: txHash,
            start_date: startDate,
            subscription_manager_address: session.metadata?.subscription_manager_address,
            amount: session.amount,
            token_address: session.tokenAddress,
            payment_date: startDate,
            delegation_data: session.metadata?.delegation_data || undefined
          };

          const subscriptionResult = await createUserSubscription(env.XATA_API_KEY, subscriptionPayload, env);
          if (!subscriptionResult.success) {
            return new Response(JSON.stringify(subscriptionResult), {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }

          const updateResult = await updatePaymentSessionDO({
            paymentId,
            status: 'paid',
            txHash,
            metadata: {
              subscription_id: subscriptionResult.subscription_id,
              payment_id: subscriptionResult.payment_id || null
            }
          }, env);

          if (!updateResult.ok || !updateResult.data?.success) {
            return new Response(JSON.stringify(updateResult.data || { success: false, error: "payment_session_update_failed" }), {
              status: updateResult.status || 500,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }

          const sanitized = sanitizePaymentSessionForClient(updateResult.data.session);
          sanitized.subscriptionId = subscriptionResult.subscription_id;
          if (subscriptionResult.payment_id) {
            sanitized.paymentRecordId = subscriptionResult.payment_id;
          }
          return new Response(JSON.stringify({ success: true, session: sanitized }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        if (!statusUpdate) {
          return new Response(JSON.stringify({ success: false, error: "missing_status" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const updateResult = await updatePaymentSessionDO({
          paymentId,
          status: statusUpdate,
          txHash,
          metadata: requestBody.metadata && typeof requestBody.metadata === 'object' ? requestBody.metadata : undefined
        }, env);

        if (!updateResult.ok || !updateResult.data?.success) {
          return new Response(JSON.stringify(updateResult.data || { success: false, error: "payment_session_update_failed" }), {
            status: updateResult.status || 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        return new Response(JSON.stringify({ success: true, session: sanitizePaymentSessionForClient(updateResult.data.session) }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      case "/api/create-subscription":
        const createSubData = await newReq.json();
        const createSubResult = await createUserSubscription(env.XATA_API_KEY, createSubData, env);
        return new Response(JSON.stringify(createSubResult), {
          status: createSubResult.success ? 201 : 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/cancel-subscription":
        const cancelSubData = await newReq.json();
        const cancelSubResult = await cancelUserSubscription(env.XATA_API_KEY, cancelSubData, env);
        return new Response(JSON.stringify(cancelSubResult), {
          status: cancelSubResult.success ? 200 : 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/create-project":
        const createProjectData = await newReq.json();
        const createProjectResult = await createProject(env.XATA_API_KEY, createProjectData, env);
        return new Response(JSON.stringify(createProjectResult), {
          status: createProjectResult?.success ? 200 : 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      case "/api/get-supported-tokens":
        const tokensResult = await getSupportedTokens(env.XATA_API_KEY, env);
        return new Response(JSON.stringify(tokensResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      case "/api/create-api-key":
        const createApiKeyData = await newReq.json();
        const createApiKeyResult = await createApiKey(env.XATA_API_KEY, createApiKeyData, env);
        return new Response(JSON.stringify(createApiKeyResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/create-subscription-plan":
        const createPlanData = await newReq.json();
        const createPlanResult = await createSubscriptionPlan(env.XATA_API_KEY, createPlanData, env);
        return new Response(JSON.stringify(createPlanResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/get-project-detailts":
        const contractInfoProjectId = newReq.headers.get("X-Project-Id");
        const projectContractInfoResult = await getProjectContractInfo(env.XATA_API_KEY, contractInfoProjectId, env);
        return new Response(JSON.stringify(projectContractInfoResult), {
          status: projectContractInfoResult.success ? 200 : 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/get-project-details":
        const project_id = newReq.headers.get("X-Project-Id");
        const projectDetailsResult = await getProjectDetails(env.XATA_API_KEY, project_id, env);
        return new Response(JSON.stringify(projectDetailsResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/get-developer-projects":
        const developerProjectsEmail = newReq.headers.get("X-User-Email");
        const developerProjectsResult = await getDeveloperProjects(env.XATA_API_KEY, developerProjectsEmail, env);
        return new Response(JSON.stringify(developerProjectsResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/create-developer":
        const createDeveloperData = await newReq.json();
        const createDeveloperResult = await createDeveloper(env.XATA_API_KEY, createDeveloperData, env);
        return new Response(JSON.stringify(createDeveloperResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/get-developer-info":
        const dev_email = newReq.headers.get("X-User-Email");
        const developerInfoResult = await getDeveloperInfo(env.XATA_API_KEY, dev_email, env);
        return new Response(JSON.stringify(developerInfoResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/get-developer-api-keys":
        const dev_email_for_keys = newReq.headers.get("X-User-Email");
        const apiKeysResult = await getDeveloperApiKeys(env.XATA_API_KEY, dev_email_for_keys, env);
        return new Response(JSON.stringify(apiKeysResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/create-developer-api-key":
        const createDevApiKeyData = await newReq.json();
        const createDevApiKeyResult = await createDeveloperApiKey(env.XATA_API_KEY, createDevApiKeyData, env);
        return new Response(JSON.stringify(createDevApiKeyResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      case "/api/get-user-delegation":
        const delegationData = await newReq.json();
        const { user_smart_account, subscription_manager_address } = delegationData;
        const delegationResult = await getUserDelegation(env.XATA_API_KEY, user_smart_account, subscription_manager_address, env);
        return new Response(JSON.stringify(delegationResult), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      default:
        return new Response("Not Found", { 
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": "*"
          }
        });
  }
}

  // --- Xata API Helper ---
async function xataRequest(endpoint, options = {}, apiKey, env) {
  const url = `${getConfig(env).DATABASE_URL_HTTPS}/${endpoint}`;
  const defaultOptions = {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
  const requestOptions = { ...defaultOptions, ...options, headers: { ...defaultOptions.headers, ...options.headers } };

  const response = await fetch(url, requestOptions);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xata API Error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  return response.json();
}
function cleanRecords(records) {
  if (!Array.isArray(records)) return records;
  
  return records.map(record => {
    const { xata_id, xata, ...cleanRecord } = record;
    
    return cleanRecord;
  });
}

  
// --- Verify developer API key ---
async function verifyApiKey(xataApiKey, targetApiKey, env) {
  if (!targetApiKey) return false;
  const response = await xataRequest("tables/developers/query", {
    method: "POST",
    body: JSON.stringify({
      columns: ["api_key"],
      filter: { api_key: targetApiKey },
      page: { size: 1 },
    }),
  }, xataApiKey, env);
  return response.records.length > 0;
}

// --- Get User's Info
async function getUserInfo(xataApiKey, user_email, env) {
  if (!user_email) return null;

  const response = await xataRequest("tables/users/query", {
    method: "POST",
    body: JSON.stringify({
      columns: ["id", "wallet_address", "smart_account_address", "email"],
      filter: { email: user_email },
      page: { size: 1 },
    }),
  }, xataApiKey, env);
  if (response.records.length === 0) return null;
  const cleanedRecords = cleanRecords(response.records);
  return cleanedRecords.length > 0 ? cleanedRecords[0] : null;
}

// --- Create User Function ---
async function createUser(xataApiKey, userData, env) {
  try {
    const response = await xataRequest("tables/users/data", {
      method: "POST",
      body: JSON.stringify({
        email: userData.email,
        wallet_address: userData.wallet_address,
        smart_account_address: userData.smart_account_address || ""
      })
    }, xataApiKey, env);

    const cleanedRecord = cleanRecords([response]);
    return cleanedRecord.length > 0 ? cleanedRecord[0] : null;
  } catch (error) {
    console.error("Error creating user:", error);
    return null;
  }
}

async function getUserSubscriptions(xataApiKey, userEmail, env) {
  if (!userEmail) return { subscriptions: [] };

  // Find user by email
  const userResponse = await xataRequest("tables/users/query", {
    method: "POST",
    body: JSON.stringify({
      columns: ["id"],
      filter: { email: userEmail },
      page: { size: 1 }
    })
  }, xataApiKey, env);

  if (userResponse.records.length === 0) {
    return { subscriptions: [] };
  }
  const userId = userResponse.records[0].id;

  // Get the user's subscriptions
  const response = await xataRequest("tables/user_subscriptions/query", {
    method: "POST",
    body: JSON.stringify({
      columns: [
        "plan_id",
        "status",
        "start_date",
        "next_payment_date",
        "last_payment_date",
        "cancelled_at",
        "subscription_manager_address",
        "plan_id.name",
        "plan_id.price",
        "plan_id.developer_id.company_name",
        "plan_id.project_id.subscription_manager_address",
        "plan_id.project_id.supported_token_id.symbol",
        "plan_id.project_id.supported_token_id.token_address"
      ],
      filter: { user_id: userId },
      page: { size: 50 },
    }),
  }, xataApiKey, env);

  const cleanedRecords = cleanRecords(response.records);
  const currentTime = Math.floor(Date.now() / 1000);

  // Track latest record per plan
  const latestByPlan = new Map();
  for (const record of cleanedRecords) {
    const planKey = record.plan_id?.id || record.plan_id;
    if (!planKey) continue;

    const existing = latestByPlan.get(planKey);
    if (!existing || (record.next_payment_date || 0) > (existing.next_payment_date || 0) || record.start_date > existing.start_date) {
      latestByPlan.set(planKey, record);
    }
  }
  
  // Transform the data to include company name and plan name at the top level (preserve history)
  const subscriptions = cleanedRecords.map(record => {
    const planKey = record.plan_id?.id || record.plan_id;
    const latestRecord = latestByPlan.get(planKey) || record;

    const nextPaymentDate = latestRecord.next_payment_date ?? record.next_payment_date;
    const lastPaymentDate = latestRecord.last_payment_date ?? record.last_payment_date;

    let actualStatus = record.status;
    if (record.cancelled_at) {
      const cancellationEffectiveDate = record.next_payment_date || record.cancelled_at;
      actualStatus = currentTime >= cancellationEffectiveDate ? "cancelled" : "active";
    } else if (latestRecord.cancelled_at) {
      actualStatus = "cancelled";
    } else if (nextPaymentDate && currentTime >= nextPaymentDate) {
      actualStatus = "expired";
    } else {
      actualStatus = "active";
    }

    return {
      plan_id: record.plan_id?.id || record.plan_id,
      plan_name: record.plan_id?.name,
      company_name: record.plan_id?.developer_id?.company_name,
      status: actualStatus,
      start_date: record.start_date,
      next_payment_date: nextPaymentDate,
      last_payment_date: lastPaymentDate,
      cancelled_at: record.cancelled_at,
      price: record.plan_id?.price || 0,
      cancellation_effective_at: record.cancellation_effective_at || nextPaymentDate || record.cancelled_at,
      subscription_manager_address: record.subscription_manager_address || record.plan_id?.project_id?.subscription_manager_address,
      token_symbol: record.plan_id?.project_id?.supported_token_id?.symbol || record.plan_id?.token_symbol,
      token_address: record.plan_id?.project_id?.supported_token_id?.token_address || record.plan_id?.token_address,
      is_latest: latestRecord === record,
    };
  });

  // Sort by start_date descending (latest first)
  subscriptions.sort((a, b) => b.start_date - a.start_date);

  return { subscriptions };
}
// Create a new user subscription and record payment in single transaction
async function createUserSubscription(xataApiKey, subscriptionData, env) {
  try {
    const { 
      user_email, 
      user_wallet_address, 
      user_smart_account_address,
      plan_id, // contract_plan_id (0, 1, 2)
      project_id,
      tx_hash, 
      start_date,
      subscription_manager_address,
      // Payment data
      amount,
      token_address,
      payment_date,
      // Delegation data (optional) - contains both approve and processPayment delegations
      delegation_data
    } = subscriptionData;

    if (!token_address) {
      return { success: false, error: "Token address is required" };
    }

    // OPTIMIZATION: Run independent queries in parallel
    const [userResponse, existingTxResponse, planResponse] = await Promise.all([
      // Query 1: Find user by email
      xataRequest("tables/users/query", {
        method: "POST",
        body: JSON.stringify({
          columns: ["id"],
          filter: { email: user_email },
          page: { size: 1 }
        })
      }, xataApiKey, env),
      
      // Query 2: Check if transaction hash was already processed (if provided)
      tx_hash ? xataRequest("tables/payments/query", {
        method: "POST",
        body: JSON.stringify({
          columns: [
            "id",
            "subscription_id"
          ],
          filter: { tx_hash: tx_hash },
          page: { size: 1 }
        })
      }, xataApiKey, env) : Promise.resolve({ records: [] }),
      
      // Query 3: Lookup subscription plan by contract_plan_id + project_id
      // Include project's subscription_manager_address for verification
      xataRequest("tables/subscription_plans/query", {
        method: "POST",
        body: JSON.stringify({
          columns: [
            "id",
            "developer_id",
            "project_id",
            "period_seconds",
            "project_id.subscription_manager_address",
            "project_id.supported_token_id.token_address",
            "project_id.supported_token_id.symbol"
          ],
          filter: { 
            contract_plan_id: parseInt(plan_id),
            project_id: project_id
          },
          page: { size: 1 }
        })
      }, xataApiKey, env)
    ]);

    // Validate user exists
    if (userResponse.records.length === 0) {
      return { success: false, error: "User not found" };
    }
    const userId = userResponse.records[0].id;

    // Check for duplicate transaction
    if (tx_hash && existingTxResponse.records.length > 0) {
      const existingPayment = existingTxResponse.records[0]
      const existingSubscriptionId = existingPayment.subscription_id?.id
        || existingPayment.subscription_id?.xata_id
        || existingPayment.subscription_id
        || null
      return {
        success: true,
        message: "Transaction already processed",
        subscription_id: existingSubscriptionId,
        payment_id: existingPayment.id
      }
    }

    // Validate plan exists
    if (planResponse.records.length === 0) {
      return { success: false, error: `Subscription plan not found for contract_plan_id: ${plan_id} in project: ${project_id}` };
    }
    
    const plan = planResponse.records[0];
    const projectSubscriptionManager = plan.project_id?.subscription_manager_address;
    const projectSupportedTokenAddress = plan.project_id?.supported_token_id?.token_address;
    const projectSupportedTokenSymbol = plan.project_id?.supported_token_id?.symbol;

    if (!projectSubscriptionManager) {
      return { success: false, error: "Project does not have a subscription manager address configured" };
    }

    if (!projectSupportedTokenAddress) {
      return { success: false, error: "Project does not have a supported token configured" };
    }

    if (token_address.toLowerCase() !== projectSupportedTokenAddress.toLowerCase()) {
      return { success: false, error: "Token address does not match project's supported token" };
    }
    
    // Verify transaction on blockchain (if tx_hash provided)
    if (tx_hash && env.HYPERSYNC_API) {
      const verification = await verifyBlockchainTransaction(
        tx_hash, 
        user_wallet_address,
        user_smart_account_address,
        plan_id,
        projectSubscriptionManager,
        env
      );
      
      if (!verification.valid) {
        return { 
          success: false, 
          error: `Blockchain verification failed: ${verification.error}` 
        };
      }
    }
    const nextPaymentDate = start_date + plan.period_seconds;
    const actualPlanId = plan.id;
    
    // Extract developer_id
    const developerId = plan.developer_id?.id || plan.developer_id;
    
    if (!developerId) {
      return { success: false, error: "Plan does not have a valid developer_id" };
    }

    // Check for conflicting active subscription managed by the same contract
    const activeSubResponse = await xataRequest("tables/user_subscriptions/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id", "cancelled_at"],
        filter: {
          user_id: userId,
          plan_id: actualPlanId,
          subscription_manager_address: subscription_manager_address,
          status: "active"
        },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    const hasActiveSubscription = activeSubResponse.records.some(record => record.cancelled_at === null || typeof record.cancelled_at === "undefined");

    if (hasActiveSubscription) {
      return { success: false, error: "Already have an active plan" };
    }

    // Always create a new subscription record for fresh history
    const newSubscription = await xataRequest("tables/user_subscriptions/data", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        plan_id: actualPlanId,
        developer_id: developerId,
        status: "active",
        start_date: start_date,
        last_payment_date: start_date,
        next_payment_date: nextPaymentDate,
        subscription_manager_address: subscription_manager_address
      })
    }, xataApiKey, env);

    const subscriptionId = newSubscription.id;

    // OPTIMIZATION: Run delegation and payment creation in parallel (they're independent)
    const shouldHandleDelegation = delegation_data && user_smart_account_address && subscription_manager_address;
    const shouldRecordPayment = amount && token_address && tx_hash;

    let paymentId = null;

    if (shouldHandleDelegation || shouldRecordPayment) {
      const tasks = [];

      // Task 1: Handle delegation
      if (shouldHandleDelegation) {
        tasks.push(
          (async () => {
            try {
              // Check if delegation already exists
              const existingDelegationResponse = await xataRequest("tables/user_delegations/query", {
                method: "POST",
                body: JSON.stringify({
                  columns: ["id"],
                  filter: { 
                    user_smart_account: user_smart_account_address,
                    subscription_manager_address: subscription_manager_address
                  },
                  page: { size: 1 }
                })
              }, xataApiKey, env);

              if (existingDelegationResponse.records.length > 0) {
                // Update existing delegation
                await xataRequest(`tables/user_delegations/data/${existingDelegationResponse.records[0].id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    delegation_data: JSON.stringify(delegation_data),
                    is_active: true,
                    cancelled_at: null
                  })
                }, xataApiKey, env);
              } else {
                // Create new delegation
                await xataRequest("tables/user_delegations/data", {
                  method: "POST",
                  body: JSON.stringify({
                    user_wallet_address: user_wallet_address,
                    user_smart_account: user_smart_account_address,
                    subscription_manager_address: subscription_manager_address,
                    delegation_data: JSON.stringify(delegation_data),
                    is_active: true,
                    created_at: Math.floor(Date.now() / 1000)
                  })
                }, xataApiKey, env);
              }
            } catch (delegationError) {
              console.error('Error handling delegation:', delegationError);
              // Don't fail the subscription creation if delegation fails
            }
          })()
        );
      }

      // Task 2: Record payment
      if (shouldRecordPayment) {
        tasks.push(
          (async () => {
            try {
              const payment = await xataRequest("tables/payments/data", {
                method: "POST",
                body: JSON.stringify({
                  subscription_id: subscriptionId,
                  user_id: userId,
                  developer_id: developerId,
                  amount: amount,
                  token_address: token_address,
                  token_symbol: projectSupportedTokenSymbol || "TOKEN",
                  payment_date: payment_date || start_date,
                  tx_hash: tx_hash
                })
              }, xataApiKey, env);

              return payment.id;
            } catch (paymentError) {
              console.error('Error recording payment:', paymentError);
              // Don't fail the entire operation if payment recording fails
              return null;
            }
          })()
        );
      }

      // Wait for both tasks to complete
      const results = await Promise.all(tasks);
      
      // Extract payment ID if payment was recorded (it's the last task if present)
      if (shouldRecordPayment) {
        paymentId = results[shouldHandleDelegation ? 1 : 0];
      }
    }

    const result = {
      success: true,
      message: "Subscription created successfully",
      subscription_id: subscriptionId
    };

    if (paymentId) {
      result.payment_id = paymentId;
      result.message += " and payment recorded";
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Cancel a user subscription after blockchain transaction
async function cancelUserSubscription(xataApiKey, cancellationData, env) {
  try {
    const { user_email, user_wallet_address, user_smart_account_address, plan_id, tx_hash, subscription_manager_address } = cancellationData;

    // Find user by email
    const userResponse = await xataRequest("tables/users/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id"],
        filter: { email: user_email },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (userResponse.records.length === 0) {
      return { success: false, error: "User not found" };
    }

    const userId = userResponse.records[0].id;

    const baseFilter = {
      user_id: userId
    };

    if (plan_id) {
      baseFilter.plan_id = plan_id;
    }

    if (subscription_manager_address) {
      baseFilter.subscription_manager_address = subscription_manager_address;
    }

    const queryBody = {
      columns: ["id", "next_payment_date", "subscription_manager_address", "start_date", "status", "cancellation_effective_at"],
      filter: { ...baseFilter, status: "active" },
      sort: {
        start_date: "desc"
      },
      page: { size: 1 }
    };

    let subResponse = await xataRequest("tables/user_subscriptions/query", {
      method: "POST",
      body: JSON.stringify(queryBody)
    }, xataApiKey, env);

    if (subResponse.records.length === 0) {
      const fallbackQuery = {
        ...queryBody,
        columns: ["id", "next_payment_date", "subscription_manager_address", "start_date", "status", "cancellation_effective_at"],
        filter: { ...baseFilter }
      };

      subResponse = await xataRequest("tables/user_subscriptions/query", {
        method: "POST",
        body: JSON.stringify(fallbackQuery)
      }, xataApiKey, env);
    }

    if (subResponse.records.length === 0) {
      return { success: false, error: "Subscription not found" };
    }

    const subscription = subResponse.records[0];
    const currentTime = Math.floor(Date.now() / 1000);
    const nextPaymentDate = subscription.next_payment_date;
    const cancellationEffectiveDate = nextPaymentDate || currentTime;
    const newStatus = "cancelled";

    // Update subscription status
    await xataRequest(`tables/user_subscriptions/data/${subscription.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: newStatus,
        cancelled_at: currentTime,
        cancellation_effective_at: cancellationEffectiveDate
      })
    }, xataApiKey, env);

    // Cancel delegation if provided
    const managerAddress = subscription_manager_address || subscription.subscription_manager_address;
    if (user_smart_account_address && managerAddress) {
      try {
        // Find and deactivate the delegation
        const delegationResponse = await xataRequest("tables/user_delegations/query", {
          method: "POST",
          body: JSON.stringify({
            columns: ["id"],
            filter: { 
              user_smart_account: user_smart_account_address,
              subscription_manager_address: managerAddress,
              is_active: true
            },
            page: { size: 1 }
          })
        }, xataApiKey, env);

        if (delegationResponse.records.length > 0) {
          await xataRequest(`tables/user_delegations/data/${delegationResponse.records[0].id}`, {
            method: "DELETE"
          }, xataApiKey, env);
        }
      } catch (delegationError) {
        console.error('Error cancelling delegation:', delegationError);
        // Don't fail the cancellation if delegation update fails
      }
    }

    return { 
      success: true, 
      message: `Subscription cancelled successfully with status: ${newStatus}`,
      status: newStatus
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create a new project
async function createProject(xataApiKey, projectData, env) {
  try {
    const {
      developer_email,
      name,
      description,
      factory_tx_hash,
      plans,
      supported_token_address
    } = projectData;

    if (!developer_email || !name || !factory_tx_hash || !Array.isArray(plans) || plans.length === 0 || !supported_token_address) {
      return { success: false, error: "Missing required fields" };
    }

    const developerResponse = await xataRequest("tables/developers/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id", "smart_account_address"],
        filter: { email: developer_email },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (developerResponse.records.length === 0) {
      return { success: false, error: "Developer not found" };
    }

    const developerRecord = developerResponse.records[0];
    const developerId = developerRecord.id;

    const supportedTokenResponse = await xataRequest("tables/supported_tokens/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id", "name", "symbol", "token_address", "image_url"],
        filter: { token_address: supported_token_address },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (supportedTokenResponse.records.length === 0) {
      return { success: false, error: "Unsupported token address" };
    }

    const supportedTokenRecord = supportedTokenResponse.records[0];

    const onchainResult = await inspectFactoryDeployment(factory_tx_hash, env, { expectedToken: supported_token_address, planCount: plans.length });

    if (!onchainResult.success) {
      return { success: false, error: onchainResult.error || "Failed to verify factory transaction" };
    }

    const { subscriptionManagerAddress, planIds } = onchainResult;

    if (planIds.length !== plans.length) {
      return { success: false, error: "Plan count mismatch between on-chain data and payload" };
    }

    const projectResponse = await xataRequest("tables/projects/data", {
      method: "POST",
      body: JSON.stringify({
        developer_id: developerId,
        supported_token_id: supportedTokenRecord.id,
        name,
        description,
        subscription_manager_address: subscriptionManagerAddress,
        is_active: true
      })
    }, xataApiKey, env);

    const createdPlans = [];

    for (let index = 0; index < plans.length; index++) {
      const plan = plans[index];
      const contractPlanId = planIds[index];

      if (!plan?.name || plan?.price == null || plan?.period_seconds == null) {
        continue;
      }

      const priceAsNumber = Number(plan.price);
      const periodAsNumber = Number(plan.period_seconds);

      if (Number.isNaN(priceAsNumber) || Number.isNaN(periodAsNumber)) {
        continue;
      }

      const planResponse = await xataRequest("tables/subscription_plans/data", {
        method: "POST",
        body: JSON.stringify({
          developer_id: developerId,
          project_id: projectResponse.id,
          contract_plan_id: contractPlanId,
          name: plan.name,
          price: priceAsNumber,
          period_seconds: periodAsNumber,
          token_address: supported_token_address,
          token_symbol: supportedTokenRecord.symbol || null
        })
      }, xataApiKey, env);

      createdPlans.push({
        id: planResponse.id,
        contract_plan_id: contractPlanId,
        name: plan.name,
        price: priceAsNumber,
        period_seconds: periodAsNumber
      });
    }

    return {
      success: true,
      project: {
        id: projectResponse.id,
        name: projectResponse.name,
        description: projectResponse.description,
        subscription_manager_address: projectResponse.subscription_manager_address,
        supported_token: {
          id: supportedTokenRecord.id,
          name: supportedTokenRecord.name,
          symbol: supportedTokenRecord.symbol,
          token_address: supportedTokenRecord.token_address,
          image_url: supportedTokenRecord.image_url || null
        },
        plans: createdPlans
      }
    };
  } catch (error) {
    console.error("Error creating project:", error);
    return { success: false, error: "Failed to create project" };
  }
}

async function getSupportedTokens(xataApiKey, env) {
  const response = await xataRequest("tables/supported_tokens/query", {
    method: "POST",
    body: JSON.stringify({
      columns: ["id", "name", "symbol", "token_address", "image_url"],
      page: { size: 200 }
    })
  }, xataApiKey, env);

  return {
    success: true,
    tokens: cleanRecords(response.records)
  };
}

async function jsonRpcRequest(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`RPC request failed with status ${response.status}`);
  }

  if (payload.error) {
    const message = typeof payload.error === "string"
      ? payload.error
      : payload.error.message || JSON.stringify(payload.error);
    throw new Error(`RPC error: ${message}`);
  }

  return payload.result;
}

function normalizeEventAddress(value) {
  if (typeof value !== "string") {
    return null;
  }

  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length === 0) {
    return null;
  }

  const trimmed = hex.padStart(40, "0").slice(-40);
  return `0x${trimmed}`.toLowerCase();
}

function decodeAddressFromEventData(data, position = 0) {
  if (typeof data !== "string") {
    return null;
  }

  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const offset = position * 64;

  if (hex.length < offset + 64) {
    return null;
  }

  const word = hex.slice(offset, offset + 64);
  return normalizeEventAddress(`0x${word.slice(-40)}`);
}

function decodeSubscriptionManagerDeployed(topics, data) {
  if (!Array.isArray(topics) || topics.length < 3) {
    return null;
  }

  const signature = topics[0]?.toLowerCase();
  if (signature !== SUBSCRIPTION_MANAGER_DEPLOYED_TOPIC) {
    return null;
  }

  const creator = normalizeEventAddress(topics[1]);
  const owner = normalizeEventAddress(topics[2]);
  const subscriptionManager = decodeAddressFromEventData(data, 0);

  if (!creator || !owner || !subscriptionManager) {
    return null;
  }

  return { creator, owner, subscriptionManager };
}

async function inspectFactoryDeployment(txHash, env, expected) {
  try {
    const rpcUrl = `https://monad-testnet.rpc.hypersync.xyz/${env.HYPERSYNC_API}`;
    const factoryAddress = env.SUBSCRIPTION_MANAGER_FACTORY;

    if (!factoryAddress) {
      return { success: false, error: "Factory configuration missing" };
    }

    const receipt = await jsonRpcRequest(rpcUrl, "eth_getTransactionReceipt", [txHash]);

    if (!receipt) {
      return { success: false, error: "Transaction not found" };
    }

    if (receipt.status !== "0x1") {
      return { success: false, error: "Factory transaction failed" };
    }

    if (!receipt.logs || receipt.logs.length === 0) {
      return { success: false, error: "No logs found on transaction" };
    }

    const hasFactoryLog = receipt.logs.some((log) => log.address?.toLowerCase() === factoryAddress.toLowerCase());

    if (!hasFactoryLog) {
      return { success: false, error: "Factory log not found" };
    }

    const deploymentLog = receipt.logs.find((log) => log.address?.toLowerCase() === factoryAddress.toLowerCase());

    if (!deploymentLog) {
      return { success: false, error: "Factory deployment log not found" };
    }

    const deploymentInfo = decodeSubscriptionManagerDeployed(deploymentLog.topics, deploymentLog.data);

    if (!deploymentInfo) {
      return { success: false, error: "Failed to decode factory deployment log" };
    }

    const { subscriptionManager: subscriptionManagerAddress } = deploymentInfo;

    const managerLogs = receipt.logs.filter((log) => log.address?.toLowerCase() === subscriptionManagerAddress.toLowerCase());

    const planLogs = managerLogs.filter((log) => log.topics?.[0]?.toLowerCase() === PLAN_CREATED_TOPIC.toLowerCase());

    if (expected?.planCount && planLogs.length !== expected.planCount) {
      return { success: false, error: "Plan event count mismatch" };
    }

    const planIds = planLogs.map((log) => parseInt(log.topics[1], 16));

    return {
      success: true,
      subscriptionManagerAddress,
      planIds
    };
  } catch (error) {
    console.error("inspectFactoryDeployment error", error);
    return { success: false, error: "Failed to inspect factory deployment" };
  }
}

// Get developer's projects
async function getDeveloperProjects(xataApiKey, developer_email, env) {
  try {
    if (!developer_email) return { projects: [] };

    // Find developer by email
    const developerResponse = await xataRequest("tables/developers/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id"],
        filter: { email: developer_email },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (developerResponse.records.length === 0) {
      return { projects: [] };
    }

    const developerId = developerResponse.records[0].id;

    // Get projects for this developer
    const projectsResponse = await xataRequest("tables/projects/query", {
      method: "POST",
      body: JSON.stringify({
        columns: [
          "id",
          "name",
          "description",
          "subscription_manager_address",
          "is_active",
          "supported_token_id.name",
          "supported_token_id.symbol",
          "supported_token_id.token_address"
        ],
        filter: { developer_id: developerId, is_active: true },
        sort: [{ "xata.createdAt": "desc" }]
      })
    }, xataApiKey, env);

    const projects = projectsResponse.records.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description,
      subscription_manager_address: project.subscription_manager_address,
      supported_token: project.supported_token_id ? {
        id: project.supported_token_id.id || project.supported_token_id.xata_id || null,
        name: project.supported_token_id.name,
        symbol: project.supported_token_id.symbol,
        token_address: project.supported_token_id.token_address
      } : null
    }));

    return { projects };
  } catch (error) {
    console.error("Error fetching developer projects:", error);
    return { projects: [] };
  }
}

// Create API key for a project
async function createApiKey(xataApiKey, apiKeyData, env) {
  try {
    const { developer_email, project_id, name, description } = apiKeyData;

    // Find developer by email
    const developerResponse = await xataRequest("tables/developers/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id"],
        filter: { email: developer_email },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (developerResponse.records.length === 0) {
      return { success: false, error: "Developer not found" };
    }

    const developerId = developerResponse.records[0].id;

    // Create API key
    const keyValue = `ak_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    const apiKeyResponse = await xataRequest("tables/api_keys/data", {
      method: "POST",
      body: JSON.stringify({
        developer_id: developerId,
        key_value: keyValue,
        name: name,
        description: description,
        is_active: true
      })
    }, xataApiKey, env);

    return { 
      success: true, 
      api_key: {
        id: apiKeyResponse.id,
        key_value: keyValue,
        name: name,
        description: description
      }
    };
  } catch (error) {
    console.error("Error creating API key:", error);
    return { success: false, error: "Failed to create API key" };
  }
}

// Create subscription plan
async function createSubscriptionPlan(xataApiKey, planData, env) {
  try {
    const { 
      developer_email, 
      project_id, 
      contract_plan_id, 
      name, 
      price, 
      period_seconds,
      token_address
    } = planData;

    // Find developer by email
    const developerResponse = await xataRequest("tables/developers/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id"],
        filter: { email: developer_email },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (developerResponse.records.length === 0) {
      return { success: false, error: "Developer not found" };
    }

    const developerId = developerResponse.records[0].id;

    // Fetch project to validate ownership and supported token
    const projectResponse = await xataRequest("tables/projects/query", {
      method: "POST",
      body: JSON.stringify({
        columns: [
          "id",
          "developer_id",
          "supported_token_id.token_address",
          "supported_token_id.symbol"
        ],
        filter: { id: project_id },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (projectResponse.records.length === 0) {
      return { success: false, error: "Project not found" };
    }

    const projectRecord = projectResponse.records[0];

    const projectDeveloperId = projectRecord.developer_id?.id || projectRecord.developer_id;
    if (projectDeveloperId && projectDeveloperId !== developerId) {
      return { success: false, error: "Project does not belong to developer" };
    }

    const supportedToken = projectRecord.supported_token_id;
    if (!supportedToken?.token_address) {
      return { success: false, error: "Project does not have a supported token configured" };
    }

    const normalizedProjectToken = supportedToken.token_address.toLowerCase();
    const providedToken = token_address?.toLowerCase();
    if (providedToken && providedToken !== normalizedProjectToken) {
      return { success: false, error: "Token address does not match project's supported token" };
    }

    const planTokenAddress = supportedToken.token_address;
    const planTokenSymbol = supportedToken.symbol || "TOKEN";

    // Create subscription plan
    const planResponse = await xataRequest("tables/subscription_plans/data", {
      method: "POST",
      body: JSON.stringify({
        developer_id: developerId,
        project_id: project_id,
        contract_plan_id: contract_plan_id,
        name: name,
        price: price,
        token_address: planTokenAddress,
        token_symbol: planTokenSymbol,
        period_seconds: period_seconds,
        is_active: true
      })
    }, xataApiKey, env);

    return { 
      success: true, 
      plan: {
        id: planResponse.id,
        contract_plan_id: contract_plan_id,
        name: name,
        price: price,
        token_symbol: planTokenSymbol,
        period_seconds: period_seconds
      }
    };
  } catch (error) {
    console.error("Error creating subscription plan:", error);
    return { success: false, error: "Failed to create subscription plan" };
  }
}

// Get minimal project contract configuration (subscription manager + token)
async function getProjectContractInfo(xataApiKey, project_id, env) {
  try {
    if (!project_id) {
      return { success: false, error: "Project ID required" };
    }

    const projectResponse = await xataRequest("tables/projects/query", {
      method: "POST",
      body: JSON.stringify({
        columns: [
          "subscription_manager_address",
          "supported_token_id.token_address"
        ],
        filter: { id: project_id },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (!projectResponse.records || projectResponse.records.length === 0) {
      return { success: false, error: "Project not found" };
    }

    const record = projectResponse.records[0];
    const subscriptionManagerAddress = record.subscription_manager_address || null;
    const tokenAddress = record.supported_token_id?.token_address || null;

    if (!subscriptionManagerAddress || !tokenAddress) {
      return { success: false, error: "Project is missing contract configuration" };
    }

    return {
      success: true,
      data: {
        subscription_manager_address: subscriptionManagerAddress,
        token_address: tokenAddress,
      }
    };
  } catch (error) {
    console.error("Error fetching project contract info:", error);
    return { success: false, error: "Failed to fetch project contract info" };
  }
}

// Get project details with API keys and subscription plans
async function getProjectDetails(xataApiKey, project_id, env) {
  try {
    if (!project_id) return { success: false, error: "Project ID required" };

    const projectResponse = await xataRequest("tables/projects/query", {
      method: "POST",
      body: JSON.stringify({
        columns: [
          "id",
          "name",
          "description",
          "subscription_manager_address",
          "supported_token_id.name",
          "supported_token_id.symbol",
          "supported_token_id.token_address"
        ],
        filter: { id: project_id },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (projectResponse.records.length === 0) {
      return { success: false, error: "Project not found" };
    }

    const projectRecord = projectResponse.records[0];

    const supportedTokenRecord = projectRecord.supported_token_id || null;
    const cleanedSupportedToken = supportedTokenRecord
      ? cleanRecords([supportedTokenRecord])[0]
      : null;

    const { xata, supported_token_id, ...projectBase } = projectRecord;

    // Get subscription plans for this project
    const plansResponse = await xataRequest("tables/subscription_plans/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id", "contract_plan_id", "name", "price", "token_symbol", "period_seconds"],
        filter: { project_id: project_id, is_active: true },
        sort: [{ "contract_plan_id": "asc" }]
      })
    }, xataApiKey, env);

    const cleanedPlans = cleanRecords(plansResponse.records || []);
    const normalizedPlans = cleanedPlans.map((plan) => ({
      ...plan,
      token_symbol: plan.token_symbol || cleanedSupportedToken?.symbol || null
    }));

    return { 
      success: true,
      data: {
        project: {
          id: projectBase.id,
          name: projectBase.name,
          description: projectBase.description,
          subscription_manager_address: projectBase.subscription_manager_address,
          supported_token: cleanedSupportedToken || null
        },
        subscription_plans: normalizedPlans
      }
    };
  } catch (error) {
    console.error("Error fetching project details:", error);
    return { success: false, error: "Failed to fetch project details" };
  }
}

// Create developer profile
async function createDeveloper(xataApiKey, developerData, env) {
  try {
    const { 
      email, 
      wallet_address, 
      smart_account_address,
      display_name, 
      company_name, 
      website_url, 
      logo_url, 
      description 
    } = developerData;

    // Check if developer already exists
    const existingDeveloperResponse = await xataRequest("tables/developers/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id", "email"],
        filter: { email: email },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (existingDeveloperResponse.records.length > 0) {
      return { success: false, error: "Developer profile already exists for this email" };
    }

    // Create developer profile
    const developerResponse = await xataRequest("tables/developers/data", {
      method: "POST",
      body: JSON.stringify({
        wallet_address: wallet_address,
        smart_account_address: smart_account_address,
        display_name: display_name,
        email: email,
        company_name: company_name,
        website_url: website_url,
        logo_url: logo_url,
        description: description,
        is_verified: false,
        is_active: true
      })
    }, xataApiKey, env);

    // Create initial API key for the developer
    const keyValue = `ak_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    const apiKeyResponse = await xataRequest("tables/api_keys/data", {
      method: "POST",
      body: JSON.stringify({
        developer_id: developerResponse.id,
        key_value: keyValue,
        name: "Default API Key",
        description: "Initial API key created with developer profile",
        is_active: true
      })
    }, xataApiKey, env);

    return { 
      success: true, 
      developer: {
        id: developerResponse.id,
        email: developerResponse.email,
        display_name: developerResponse.display_name,
        company_name: developerResponse.company_name,
        is_verified: developerResponse.is_verified
      },
      initial_api_key: {
        id: apiKeyResponse.id,
        key_value: keyValue,
        name: "Default API Key",
        description: "Initial API key created with developer profile"
      }
    };
  } catch (error) {
    console.error("Error creating developer:", error);
    return { success: false, error: "Failed to create developer profile" };
  }
}

// Get developer information by email
async function getDeveloperInfo(xataApiKey, email, env) {
  try {
    if (!email) return { found: false };

    const developerResponse = await xataRequest("tables/developers/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id", "wallet_address", "smart_account_address", "display_name", "email", "company_name", "website_url", "logo_url", "description", "is_verified", "is_active"],
        filter: { email: email },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (developerResponse.records.length === 0) {
      return { found: false };
    }

    const developer = developerResponse.records[0];
    return { 
      found: true, 
      developer: {
        id: developer.id,
        wallet_address: developer.wallet_address,
        smart_account_address: developer.smart_account_address,
        display_name: developer.display_name,
        email: developer.email,
        company_name: developer.company_name,
        website_url: developer.website_url,
        logo_url: developer.logo_url,
        description: developer.description,
        is_verified: developer.is_verified,
        is_active: developer.is_active
      }
    };
  } catch (error) {
    console.error("Error fetching developer info:", error);
    return { found: false, error: "Failed to fetch developer information" };
  }
}

// Get developer's API keys
async function getDeveloperApiKeys(xataApiKey, email, env) {
  try {
    if (!email) return { success: false, error: "Email required" };

    // First get developer info
    const developerInfo = await getDeveloperInfo(xataApiKey, email, env);
    if (!developerInfo.found) {
      return { success: false, error: "Developer not found" };
    }

    const developerId = developerInfo.developer.id;

    // Get API keys for this developer
    const apiKeysResponse = await xataRequest("tables/api_keys/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id", "key_value", "name", "description", "is_active"],
        filter: { developer_id: developerId, is_active: true },
        sort: [{ "xata.createdAt": "desc" }]
      })
    }, xataApiKey, env);

    if (!apiKeysResponse || apiKeysResponse.error) {
      return { success: false, error: "Failed to fetch API keys" };
    }

    return { 
      success: true, 
      data: {
        api_keys: apiKeysResponse.records || []
      }
    };
  } catch (error) {
    console.error("Error fetching developer API keys:", error);
    return { success: false, error: "Failed to fetch API keys" };
  }
}

// Create developer API key (not tied to specific project)
async function createDeveloperApiKey(xataApiKey, keyData, env) {
  try {
    const { developer_email, name, description } = keyData;

    if (!developer_email || !name) {
      return { success: false, error: "Developer email and name are required" };
    }

    // Get developer info
    const developerInfo = await getDeveloperInfo(xataApiKey, developer_email, env);
    if (!developerInfo.found) {
      return { success: false, error: "Developer not found" };
    }

    const developerId = developerInfo.developer.id;

    // Generate API key
    const keyValue = `ak_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

    // Create API key
    const apiKeyResponse = await xataRequest("tables/api_keys/data", {
      method: "POST",
      body: JSON.stringify({
        developer_id: developerId,
        key_value: keyValue,
        name: name,
        description: description || "",
        is_active: true
      })
    }, xataApiKey, env);

    if (!apiKeyResponse || apiKeyResponse.error) {
      return { success: false, error: "Failed to create API key" };
    }

    return { 
      success: true, 
      data: {
        api_key: {
          id: apiKeyResponse.id,
          key_value: keyValue,
          name: name,
          description: description || "",
          is_active: true
        }
      }
    };
  } catch (error) {
    console.error("Error creating developer API key:", error);
    return { success: false, error: "Failed to create API key" };
  }
}

// Get user delegation for a subscription
async function getUserDelegation(xataApiKey, user_smart_account, subscription_manager_address, env) {
  try {
    if (!user_smart_account || !subscription_manager_address) {
      return { success: false, error: "Smart account and subscription manager address required" };
    }

    // Query user_delegations table
    const delegationResponse = await xataRequest("tables/user_delegations/query", {
      method: "POST",
      body: JSON.stringify({
        columns: ["id", "user_wallet_address", "user_smart_account", "subscription_manager_address", 
                  "delegation_data", "is_active", "created_at"],
        filter: { 
          user_smart_account: user_smart_account,
          subscription_manager_address: subscription_manager_address,
          is_active: true
        },
        page: { size: 1 }
      })
    }, xataApiKey, env);

    if (!delegationResponse || delegationResponse.error) {
      return { success: false, error: "Failed to fetch delegation" };
    }

    if (delegationResponse.records.length === 0) {
      return { success: false, error: "No active delegation found" };
    }

    const delegation = delegationResponse.records[0];
    
    // Parse delegation_data if it's a string - this contains the complete signed delegation
    let delegationData = delegation.delegation_data;
    if (typeof delegationData === 'string') {
      try {
        delegationData = JSON.parse(delegationData);
      } catch (e) {
        console.error('Failed to parse delegation_data:', e);
        return { success: false, error: "Invalid delegation data format" };
      }
    }

    // Return the delegation_data as-is - it already contains everything needed
    // Including: delegate, delegator, authority, caveats, salt, signature
    return { 
      success: true, 
      data: {
        delegation: delegationData
      }
    };
  } catch (error) {
    console.error("Error fetching user delegation:", error);
    return { success: false, error: "Failed to fetch delegation" };
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};