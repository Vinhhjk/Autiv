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

    // CHECK 2: Token approval sufficient?
    console.log('Checking token approval...');
    await sleep(500); // 0.5 second delay
    const tokenContract = new ethers.Contract(
        planDetails.tokenAddress,
        ['function allowance(address owner, address spender) view returns (uint256)'],
        agent
    );
    
    await sleep(300); // Small delay before token call
    const currentAllowance = await withRateLimit(async () => {
        return await tokenContract.allowance(target_address, deploymentAdress.SUBSCRIPTION_MANAGER);
    }, 'monad');
    const requiredAmount = planDetails.price;

    if (currentAllowance < requiredAmount) {
        console.log('FAILED: Insufficient token approval');
        return { success: false, reason: 'Insufficient approval', currentAllowance: currentAllowance.toString(), required: requiredAmount.toString() };
    }
    console.log('PASSED: Token approval is sufficient');

    // CHECK 3: Skip delegation validation to reduce RPC calls
    console.log('Skipping delegation validation (assuming valid)...');

    // Use the processPayment delegation data from test script
    const signedProcessPaymentDelegation = {
  "delegate": "0x406b16A36926814305dF25757c93d298b639Bef0",
  "delegator": "0x9D54F12eb708645a99C0356387BC76846C3CA802",
  "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "caveats": [
    {
      "enforcer": "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
      "terms": "0xd8840e4A14fDd6833F213919ebF5727ee9E2E4dB",
      "args": "0x"
    },
    {
      "enforcer": "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
      "terms": "0x8fe123d7",
      "args": "0x"
    }
  ],
  "salt": "0x",
  "signature": "0x68d0db56e5da90f8acf0aa9dc8ef2d9ddc5efafb039f8ae7d9ef8a324d300fcd4a633f6b06cc2142e60eee8dbbf739fe6ec0c1c0e3aba8a1e6f231ded6d0d99e1b"
}
;

    const environment = getDeleGatorEnvironment(MONAD_TESTNET_CHAIN_ID);
    if (!environment) {
        throw new Error('Delegation environment not found for Monad Testnet');
    }

    console.log('PASSED: Using delegation (validation skipped)');

    // ALL CONDITIONS PASSED - PROCEED WITH PAYMENT
    console.log('\n=== PROCESSING PAYMENT ===');

    try {
        const processPaymentCalldata = SubscriptionManagerContract.interface.encodeFunctionData(
            'processPayment',
            [target_address]
        );

        const processPaymentExecution = createExecution({
            target: SubscriptionManagerAddress,
            value: 0n,
            callData: processPaymentCalldata
        });

        const processPaymentCalldataFull = DelegationManager.encode.redeemDelegations({
            delegations: [[signedProcessPaymentDelegation]],
            modes: [ExecutionMode.SingleDefault],
            executions: [[processPaymentExecution]],
        });

        console.log('Sending transaction...');
        const processTx = await withRateLimit(async () => {
            return await agent.sendTransaction({
                to: environment.DelegationManager,
                data: processPaymentCalldataFull,
            });
        }, 'monad');

        console.log('Payment transaction sent:', processTx.hash);
        console.log('Waiting for confirmation...');

        // Wait for transaction confirmation using Monad RPC first
        const processReceipt = await processTx.wait();
        
        try {
            const hypersyncReceipt = await withRateLimit(async () => {
                return await hypersyncProvider.getTransactionReceipt(processTx.hash);
            }, 'hypersync');
            
            console.log('Payment completed - TX:', processTx.hash);
            console.log('Block:', hypersyncReceipt.blockNumber, 'Gas used:', hypersyncReceipt.gasUsed.toString());
        } catch (error) {
            // Fallback to Monad receipt if HyperSync fails
            console.log('Payment completed - TX:', processTx.hash);
            console.log('Block:', processReceipt.blockNumber, 'Gas used:', processReceipt.gasUsed.toString());
        }

        return {
            success: true,
            processTxHash: processTx.hash,
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
