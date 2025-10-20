import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory and load .env from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { ethers } from 'ethers';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { createExecution, ExecutionMode } from '@metamask/delegation-toolkit';
import deploymentAdress from '../deployment-addresses.json' with { type: 'json' };

const SubscriptionManagerABI = SubscriptionManager.abi;
const MONAD_RPC_URL = 'https://monad-testnet.drpc.org';
const HYPERSYNC_RPC_URL = process.env.HYPERSYNC_API ? 
    `https://monad-testnet.rpc.hypersync.xyz/${process.env.HYPERSYNC_API}` : 
    'https://monad-testnet.rpc.hypersync.xyz';
const MONAD_TESTNET_CHAIN_ID = 10143;

async function withRateLimit(fn, rpcType = 'monad', maxRetries = 3) {
    let retryCount = maxRetries;
    
    while (retryCount > 0) {
        try {
            return await fn();
        } catch (error) {
            const isRateLimit = (
                (error.code === 'CALL_EXCEPTION' && error.info?.error?.code === -32007) ||
                (error.code === 'UNKNOWN_ERROR' && error.error?.code === -32007) ||
                error.message?.includes('rate limit') ||
                error.message?.includes('request limit')
            );
            
            if (isRateLimit && retryCount > 1) {
                // Softer backoff: 2s, 3s, 4s
                const waitTime = (maxRetries - retryCount + 2) * 1000;
                console.log(`${rpcType.toUpperCase()} rate limit hit, waiting ${waitTime/1000} seconds... (${retryCount - 1} retries left)`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                retryCount--;
            } else {
                throw error;
            }
        }
    }
}

// Add delay between operations to prevent rate limiting
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Global instances (created once, reused forever)
let monadProvider;
let hypersyncProvider;
let agent;
let SubscriptionManagerContract;
let SubscriptionManagerAddress; // Add global variable for subscription manager address
let tokenAddress; // Add global variable for token address
let isInitialized = false;

// Initialize providers and contracts once
async function initializePaymentProcessor() {
    if (isInitialized) return;
    
    console.log('Initializing Payment Processor...');
    
    // Create providers with explicit network config (ONCE)
    monadProvider = new ethers.JsonRpcProvider(MONAD_RPC_URL, {
        chainId: MONAD_TESTNET_CHAIN_ID,
        name: 'monad-testnet'
    });
    
    hypersyncProvider = new ethers.JsonRpcProvider(HYPERSYNC_RPC_URL, {
        chainId: MONAD_TESTNET_CHAIN_ID,
        name: 'monad-testnet-hypersync'
    });

    // Create wallet and agent (ONCE)
    const wallet = new ethers.Wallet(process.env.EOA_PRIVATE_KEY);
    agent = wallet.connect(monadProvider);

    console.log('Agent Address:', agent.address);

    SubscriptionManagerAddress = deploymentAdress.SUBSCRIPTION_MANAGER;
    tokenAddress = deploymentAdress.USDC_ADDRESS;

    // Create contract instance (ONCE)
    SubscriptionManagerContract = new ethers.Contract(
        SubscriptionManagerAddress,
        SubscriptionManagerABI,
        agent
    );
    
    isInitialized = true;
    console.log('Payment Processor initialized successfully');
}

// Process payment for a single user (reuses global instances)
async function processPaymentForUser(target_address) {
    console.log(`\n=== PROCESSING PAYMENT FOR ${target_address} ===`);

    console.log('\n=== PRE-FLIGHT CHECKS ===');
    
    // Get user's subscription details first (with softer rate limiting)
    console.log('Getting subscription details...');
    await sleep(500); // 0.5 second delay before first call
    const subscription = await withRateLimit(async () => {
        return await SubscriptionManagerContract.getUserSubscription(target_address);
    }, 'monad');
    
    await sleep(500); // 0.5 second delay between calls
    const planDetails = await withRateLimit(async () => {
        return await SubscriptionManagerContract.getPlan(subscription.planId);
    }, 'monad');

    // CHECK 1: Is payment due?
    console.log('Checking payment status...');
    await sleep(500); // 0.5 second delay
    const paymentDueResult = await withRateLimit(async () => {
        return await SubscriptionManagerContract.isPaymentDue(target_address);
    }, 'monad');
    const isPaymentDue = paymentDueResult[0];

    if (!isPaymentDue) {
        console.log('FAILED: Payment is not due yet');
        return { success: false, reason: 'Payment not due' };
    }
    console.log('PASSED: Payment is due');


    // CHECK 3: Skip delegation validation to reduce RPC calls
    console.log('Skipping delegation validation (assuming valid)...');
    const signedApproveDelegation ={
  "delegate": "0x406b16A36926814305dF25757c93d298b639Bef0",
  "delegator": "0x9D54F12eb708645a99C0356387BC76846C3CA802",
  "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "caveats": [
    {
      "enforcer": "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
      "terms": "0x7B35FBfa0635dbF7c4ACFA733585b90e3531888A",
      "args": "0x"
    },
    {
      "enforcer": "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
      "terms": "0x095ea7b3",
      "args": "0x"
    }
  ],
  "salt": 1760892846,
  "signature": "0xf531ded7962790afa6e2a0409fa1157dd6128e5777cf77695eac14a26ce38a9e5b4d04c82db64d5f9a3cf4a1e5c66db1f770dd723b21b09f86b65711f9c07dda1c"
}

    const signedProcessPaymentDelegation= {
  "delegate": "0x406b16A36926814305dF25757c93d298b639Bef0",
  "delegator": "0x9D54F12eb708645a99C0356387BC76846C3CA802",
  "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "caveats": [
    {
      "enforcer": "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
      "terms": "0x2cDdE59123226e7321180153bBDB21CCF848c301",
      "args": "0x"
    },
    {
      "enforcer": "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
      "terms": "0x8fe123d7",
      "args": "0x"
    }
  ],
  "salt": 1760892847,
  "signature": "0x649411340ec0e1ba578ada43fb5039a3af59a0c86682fb8a4e6692c806c0341516929ee050b6e9bf28592ac9ea99a5488696ffe4ceff289a1ffd7652803045a61c"
}
const environment = getDeleGatorEnvironment(MONAD_TESTNET_CHAIN_ID);
    if (!environment) {
        throw new Error('Delegation environment not found for Monad Testnet');
    }

    console.log('PASSED: Using delegation (validation skipped)');

    // ALL CONDITIONS PASSED - PROCEED WITH PAYMENT
    console.log('\n=== PROCESSING PAYMENT ===');

    try {
        // Get token address from plan details
        const planTokenAddress = planDetails.tokenAddress;
        console.log('Plan Token Address:', planTokenAddress);
        console.log('Subscription Manager Address:', SubscriptionManagerAddress);
        console.log('Plan Price:', planDetails.price.toString());
        
        // Define ERC20 ABI for approve function
        const erc20Abi = [
            {
                inputs: [
                    { internalType: 'address', name: 'spender', type: 'address' },
                    { internalType: 'uint256', name: 'amount', type: 'uint256' },
                ],
                name: 'approve',
                outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
                stateMutability: 'nonpayable',
                type: 'function',
            },
        ];

        // Create token contract instance
        const tokenContract = new ethers.Contract(planTokenAddress, erc20Abi, agent);
        // Prepare approve calldata for token spending
        const approveCalldata = tokenContract.interface.encodeFunctionData(
            'approve',
            [SubscriptionManagerAddress, planDetails.price]
        );

        // Prepare processPayment calldata
        const processPaymentCalldata = SubscriptionManagerContract.interface.encodeFunctionData(
            'processPayment',
            [target_address]
        );

        console.log('Approve Calldata:', approveCalldata);
        console.log('ProcessPayment Calldata:', processPaymentCalldata);

        // Create executions for both actions using the single delegation
        const approveExecution = createExecution({
            target: planTokenAddress,
            value: 0n,
            callData: approveCalldata
        });

        const processPaymentExecution = createExecution({
            target: SubscriptionManagerAddress,
            value: 0n,
            callData: processPaymentCalldata
        });

        console.log('Approve Execution:', approveExecution);
        console.log('ProcessPayment Execution:', processPaymentExecution);
        console.log('Signed Approve Delegation:', signedApproveDelegation);
        console.log('Signed Process Delegation:', signedProcessPaymentDelegation);

        console.log('Encoding approve delegation redemption...');
        const approveCalldataEncoded = DelegationManager.encode.redeemDelegations({
            delegations: [[signedApproveDelegation]],
            modes: [ExecutionMode.SingleDefault],
            executions: [[approveExecution]],
        });

        console.log('Sending approve redemption...');
        const approveTx = await withRateLimit(async () => {
            return await agent.sendTransaction({
                to: environment.DelegationManager,
                data: approveCalldataEncoded,
            });
        }, 'monad');

        console.log('Approve TX sent:', approveTx.hash);
        const approveReceipt = await approveTx.wait();

        console.log('Encoding processPayment delegation redemption...');
        const processCalldataEncoded = DelegationManager.encode.redeemDelegations({
            delegations: [[signedProcessPaymentDelegation]],
            modes: [ExecutionMode.SingleDefault],
            executions: [[processPaymentExecution]],
        });

        console.log('Sending processPayment redemption...');
        const processTx = await withRateLimit(async () => {
            return await agent.sendTransaction({
                to: environment.DelegationManager,
                data: processCalldataEncoded,
            });
        }, 'monad');

        console.log('ProcessPayment TX sent:', processTx.hash);
        const processReceipt = await processTx.wait();

        try {
            const hypersyncApprove = await withRateLimit(async () => {
                return await hypersyncProvider.getTransactionReceipt(approveTx.hash);
            }, 'hypersync');
            console.log('Approve confirmed - Block:', hypersyncApprove.blockNumber, 'Gas used:', hypersyncApprove.gasUsed.toString());
        } catch (error) {
            console.log('Approve confirmed - Block:', approveReceipt.blockNumber, 'Gas used:', approveReceipt.gasUsed.toString());
        }

        try {
            const hypersyncProcess = await withRateLimit(async () => {
                return await hypersyncProvider.getTransactionReceipt(processTx.hash);
            }, 'hypersync');
            console.log('Payment completed - TX:', processTx.hash);
            console.log('Block:', hypersyncProcess.blockNumber, 'Gas used:', hypersyncProcess.gasUsed.toString());
        } catch (error) {
            console.log('Payment completed - TX:', processTx.hash);
            console.log('Block:', processReceipt.blockNumber, 'Gas used:', processReceipt.gasUsed.toString());
        }

        return {
            success: true,
            approveTxHash: approveTx.hash,
            processTxHash: processTx.hash,
            approveBlockNumber: approveReceipt.blockNumber,
            processBlockNumber: processReceipt.blockNumber
        };

    } catch (error) {
        console.error('Payment failed:', error.message);
        return {
            success: false,
            reason: 'Payment execution failed',
            error: error.message
        };
    }
}

// Legacy function for single payment (backward compatibility)
async function processPaymentWithDelegation() {
    await initializePaymentProcessor();
    const target_address = '0x9D54F12eb708645a99C0356387BC76846C3CA802';
    return await processPaymentForUser(target_address);
}

// Infinite payment collection daemon
async function startPaymentDaemon(userAddresses, checkIntervalMinutes = 5) {
    console.log('Starting Payment Collection Daemon...');
    console.log(`Monitoring ${userAddresses.length} users`);
    console.log(`Check interval: ${checkIntervalMinutes} minutes`);
    
    // Initialize once at startup
    await initializePaymentProcessor();
    
    let cycleCount = 0;
    
    while (true) {
        try {
            cycleCount++;
            console.log(`\n🔄 === PAYMENT CYCLE ${cycleCount} ===`);
            console.log(`${new Date().toLocaleString()}`);
            
            // Process payments for all users
            for (const userAddress of userAddresses) {
                try {
                    const result = await processPaymentForUser(userAddress);
                    if (result.success) {
                        console.log(`Payment collected for ${userAddress}: ${result.processTxHash}`);
                    } else {
                        console.log(`No payment needed for ${userAddress}: ${result.reason}`);
                    }
                } catch (error) {
                    console.error(`Error processing ${userAddress}:`, error.message);
                }
                
                // Small delay between users to avoid rate limiting
                await sleep(2000);
            }
            
            // Wait for next cycle
            const waitTimeMs = checkIntervalMinutes * 60 * 1000;
            console.log(`Waiting ${checkIntervalMinutes} minutes until next cycle...`);
            await sleep(waitTimeMs);
            
        } catch (error) {
            console.error('Daemon error:', error.message);
            console.log('Retrying in 1 minute...');
            await sleep(60000); // Wait 1 minute before retrying
        }
    }
}

// Run based on command line arguments
if (process.argv.includes('--daemon')) {
    // Daemon mode: monitor multiple users continuously
    const userAddresses = [
        '0x9D54F12eb708645a99C0356387BC76846C3CA802', // Add more user addresses here
        // '0x...' // Additional users
    ];
    startPaymentDaemon(userAddresses, 5).catch(console.error);
} else {
    // Single run mode (backward compatibility)
    processPaymentWithDelegation().catch(console.error);
}
