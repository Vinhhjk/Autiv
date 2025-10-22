import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { createExecution, ExecutionMode } from '@metamask/delegation-toolkit';

// Resolve workspace root and load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL
const MONAD_RPC_URL = 'https://testnet-rpc.monad.xyz';
const HYPERSYNC_RPC_URL = `https://monad-testnet.rpc.hypersync.xyz/${process.env.HYPERSYNC_API}`
const MONAD_TESTNET_CHAIN_ID = 10143;

const MAX_CONCURRENT_PAYMENTS = Number(process.env.PAYMENT_BATCH_SIZE || 20);
const POLL_INTERVAL_MS = Number(process.env.PAYMENT_POLL_INTERVAL_MS || 60_000);
const RATE_LIMIT_BACKOFFS = [1_000, 2_000, 3_000];

const pool = new Pool({ connectionString: DATABASE_URL });

let monadProvider;
let hypersyncProvider;
let agent;
let environment;
let subscriptionManagerAbi;
let initialized = false;

const tokenInterface = new ethers.Interface([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function decimals() view returns (uint8)',
]);

const subscriptionManagerContracts = new Map();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForReceipt(txHash, { pollIntervalMs = 1500, timeoutMs = 120000 } = {}) {
  const start = Date.now();
  let attempt = 0;
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for receipt ${txHash}`);
    }

    try {
      const receipt = await withRateLimit(
        () => hypersyncProvider.getTransactionReceipt(txHash),
        'receipt'
      );
      if (receipt) {
        return receipt;
      }
    } catch (error) {
      console.warn(`Failed to fetch receipt ${txHash} (attempt ${++attempt}):`, error);
    }

    await sleep(pollIntervalMs);
  }
}

async function withRateLimit(fn, label = 'rpc') {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      console.error(`[${label}]`, error);
      const isRateLimited =
        error?.code === 'CALL_EXCEPTION' ||
        error?.info?.error?.code === -32007 ||
        error?.error?.code === -32007 ||
        (typeof error?.message === 'string' && error.message.toLowerCase().includes('rate'));

      if (!isRateLimited) {
        throw error;
      }

      const backoffIndex = Math.min(attempt, RATE_LIMIT_BACKOFFS.length - 1);
      const waitMs = RATE_LIMIT_BACKOFFS[backoffIndex];
      attempt++;
      console.log(`[${label}] rate limit hit - backing off ${waitMs / 1000}s (attempt ${attempt})`);
      await sleep(waitMs);
    }
  }
}

async function initialize() {
  if (initialized) return;
  console.log('Initializing payment collector...');

  monadProvider = new ethers.JsonRpcProvider(MONAD_RPC_URL, {
    chainId: MONAD_TESTNET_CHAIN_ID,
    name: 'monad-testnet',
  });

  hypersyncProvider = new ethers.JsonRpcProvider(HYPERSYNC_RPC_URL, {
    chainId: MONAD_TESTNET_CHAIN_ID,
    name: 'monad-hypersync',
  });

  const privateKey = process.env.EOA_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('EOA_PRIVATE_KEY is required for payment collection');
  }

  agent = new ethers.Wallet(privateKey, monadProvider);
  environment = getDeleGatorEnvironment(MONAD_TESTNET_CHAIN_ID);
  if (!environment) {
    throw new Error('Delegation environment not available for Monad Testnet');
  }

  const subscriptionManagerArtifact = await import('../artifacts/contract/contracts/SubscriptionManager.sol/SubscriptionManager.json', { with: { type: 'json' } });
  subscriptionManagerAbi = subscriptionManagerArtifact.default?.abi || subscriptionManagerArtifact.abi;

  initialized = true;
  console.log('Payment collector initialized with agent', agent.address);
}

function getSubscriptionManagerContract(address) {
  if (!address) {
    throw new Error('Subscription manager address missing for subscription');
  }
  if (!subscriptionManagerAbi) {
    throw new Error('Subscription manager ABI not loaded');
  }

  if (!subscriptionManagerContracts.has(address)) {
    subscriptionManagerContracts.set(
      address,
      new ethers.Contract(address, subscriptionManagerAbi, agent)
    );
  }

  return subscriptionManagerContracts.get(address);
}

async function fetchDueSubscriptions(limit) {
  const client = await pool.connect();
  try {
    const now = Math.floor(Date.now() / 1000);

    const { rows } = await client.query(
      `SELECT
        us.xata_id              AS subscription_id,
        us.user_id              AS user_record_id,
        us.plan_id              AS plan_record_id,
        us.developer_id         AS developer_record_id,
        us.subscription_manager_address,
        us.next_payment_date,
        us.last_payment_date,
        us.status,
        u.wallet_address,
        u.smart_account_address,
        sp.project_id,
        sp.contract_plan_id,
        sp.price                AS plan_price,
        sp.token_address,
        sp.token_symbol,
        sp.period_seconds,
        d.wallet_address        AS developer_wallet,
        st.token_address        AS supported_token_address,
        st.symbol               AS supported_token_symbol,
        ud.delegation_data
       FROM user_subscriptions us
       JOIN users u ON u.xata_id = us.user_id
       JOIN subscription_plans sp ON sp.xata_id = us.plan_id
       JOIN projects p ON p.xata_id = sp.project_id
       JOIN supported_tokens st ON st.xata_id = p.supported_token_id
       JOIN developers d ON d.xata_id = us.developer_id
       JOIN user_delegations ud ON ud.user_smart_account = u.smart_account_address
        AND ud.subscription_manager_address = us.subscription_manager_address
        AND ud.is_active = TRUE
       WHERE us.status = 'active'
         AND us.next_payment_date IS NOT NULL
         AND us.next_payment_date <= $1
       ORDER BY us.next_payment_date ASC
       LIMIT $2`,
      [now, limit]
    );

    return rows.map(row => ({
      subscriptionId: row.subscription_id,
      userRecordId: row.user_record_id,
      developerRecordId: row.developer_record_id,
      smartAccount: row.smart_account_address,
      walletAddress: row.wallet_address,
      subscriptionManager: row.subscription_manager_address,
      projectId: row.project_id,
      contractPlanId: Number(row.contract_plan_id),
      tokenAddress: row.supported_token_address || row.token_address,
      tokenSymbol: row.supported_token_symbol || row.token_symbol || 'USDC',
      periodSeconds: Number(row.period_seconds),
      delegationDataRaw: row.delegation_data,
    }));
  } finally {
    client.release();
  }
}

const tokenMetadataCache = new Map();

async function getTokenMetadata(tokenAddress) {
  if (tokenMetadataCache.has(tokenAddress)) {
    return tokenMetadataCache.get(tokenAddress);
  }

  const contract = new ethers.Contract(tokenAddress, tokenInterface, monadProvider);
  const decimals = await withRateLimit(() => contract.decimals(), 'token-decimals');
  const metadata = { decimals: Number(decimals) };
  tokenMetadataCache.set(tokenAddress, metadata);
  return metadata;
}

async function updatePaymentRecords({ subscriptionId, userRecordId, developerRecordId, amountDecimal, tokenAddress, tokenSymbol, txHash, periodSeconds }) {
  const client = await pool.connect();
  const now = Math.floor(Date.now() / 1000);
  const nextPaymentDate = periodSeconds && Number(periodSeconds) > 0
    ? now + Number(periodSeconds)
    : null;
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE user_subscriptions
        SET last_payment_date = $1,
            next_payment_date = $2
       WHERE xata_id = $3`,
      [now, nextPaymentDate, subscriptionId]
    );

    await client.query(
      `INSERT INTO payments (
          subscription_id,
          user_id,
          developer_id,
          amount,
          token_address,
          token_symbol,
          payment_date,
          tx_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        subscriptionId,
        userRecordId,
        developerRecordId,
        amountDecimal,
        tokenAddress,
        tokenSymbol,
        now,
        txHash,
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function processSubscription(subscription) {
  const {
    subscriptionId,
    smartAccount,
    contractPlanId,
    tokenAddress,
    tokenSymbol,
    periodSeconds,
    delegationDataRaw,
    userRecordId,
    developerRecordId,
    subscriptionManager,
  } = subscription;

  if (!delegationDataRaw) {
    console.log(`Skipping ${smartAccount} - missing delegation data`);
    return { status: 'skipped', reason: 'no_delegation' };
  }

  let managerContract;
  try {
    managerContract = getSubscriptionManagerContract(subscriptionManager);
  } catch (error) {
    console.error('Skipping subscription due to missing manager contract', subscriptionId, error);
    return { status: 'error', error };
  }

  let delegationData;
  try {
    delegationData = typeof delegationDataRaw === 'string' ? JSON.parse(delegationDataRaw) : delegationDataRaw;
  } catch (error) {
    console.error('Failed to parse delegation JSON for', smartAccount, error);
    return { status: 'error', error };
  }

  const signedApproveDelegation = delegationData.signedApproveDelegation;
  const signedProcessPaymentDelegation = delegationData.signedProcessPaymentDelegation;
  const planDetails = await withRateLimit(
    () => managerContract.getPlan(contractPlanId),
    'subscription-plan'
  );

  const paymentDue = await withRateLimit(
    () => managerContract.isPaymentDue(smartAccount),
    'is-payment-due'
  );

  if (!paymentDue[0]) {
    console.log(`Payment not due for ${smartAccount}`);
    return { status: 'not_due' };
  }

  const planTokenAddress = planDetails.tokenAddress || tokenAddress;

  const approveCalldata = tokenInterface.encodeFunctionData('approve', [
    planDetails.subscriptionManager || planDetails.subscriptionManagerAddress || managerContract.target,
    planDetails.price,
  ]);

  const processPaymentCalldata = managerContract.interface.encodeFunctionData('processPayment', [smartAccount]);

  const approveExecution = createExecution({
    target: planTokenAddress,
    value: 0n,
    callData: approveCalldata,
  });

  const processPaymentExecution = createExecution({
    target: managerContract.target,
    value: 0n,
    callData: processPaymentCalldata,
  });

  const combinedRedeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [
      [signedApproveDelegation],
      [signedProcessPaymentDelegation],
    ],
    modes: [ExecutionMode.SingleDefault, ExecutionMode.SingleDefault],
    executions: [
      [approveExecution],
      [processPaymentExecution],
    ],
  });

  const combinedTx = await withRateLimit(
    () => agent.sendTransaction({ to: environment.DelegationManager, data: combinedRedeemCalldata }),
    'send-tx-combined'
  );

  console.log(`Tx sent: ${combinedTx.hash} for ${smartAccount}`);
  const receipt = await waitForReceipt(combinedTx.hash);

  try {
    const periodSecondsOnChain = Number(planDetails.periodSeconds || periodSeconds);
    const { decimals } = await getTokenMetadata(tokenAddress);
    const amountDecimal = ethers.formatUnits(planDetails.price, decimals);

    await updatePaymentRecords({
      subscriptionId,
      userRecordId,
      developerRecordId,
      amountDecimal,
      tokenAddress,
      tokenSymbol,
      txHash: combinedTx.hash,
      periodSeconds: periodSecondsOnChain,
    });

    console.log(`Payment confirmed for ${smartAccount} in block ${receipt.blockNumber}`);
    return { status: 'paid', txHash: combinedTx.hash, periodSeconds: periodSecondsOnChain };
  } catch (error) {
    console.error('Failed to update payment records for', smartAccount, error);
    throw error;
  }
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function processBatch(subscriptions) {
  const groups = chunk(subscriptions, MAX_CONCURRENT_PAYMENTS);
  for (const group of groups) {
    await Promise.allSettled(group.map(sub => processSubscription(sub)));
  }
}

async function startCollector() {
  await initialize();

  while (true) {
    try {
      const due = await fetchDueSubscriptions(MAX_CONCURRENT_PAYMENTS * 5);

      if (due.length === 0) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log(`Processing ${due.length} due subscriptions...`);
      await processBatch(due);
    } catch (error) {
      console.error('Collector loop error:', error);
      await sleep(10_000);
    }
  }
}

if (import.meta.main) {
  startCollector()
    .catch(error => {
      console.error('Collector failed', error);
      process.exitCode = 1;
    });
}

