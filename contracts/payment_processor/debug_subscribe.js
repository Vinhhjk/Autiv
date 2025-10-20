import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory and load .env from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import {
    http,
    createPublicClient,
    createWalletClient,
    encodeFunctionData
} from 'viem';
import { createBundlerClient, createPaymasterClient  } from 'viem/account-abstraction';

import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };
import deploymentAdress from '../deployment-addresses.json' with { type: 'json' };

// Load EOA private key
const account = privateKeyToAccount(process.env.TEST_EOA_FOR_SUB);

// Transport + clients
const transport = http();
const publicClient = createPublicClient({
  transport,
  chain: monadTestnet,
});
const walletClient = createWalletClient({
  account,
  transport,
  chain: monadTestnet,
});

async function debugSmartAccount() {
    console.log('=== DEBUGGING SMART ACCOUNT ISSUE ===');
    
    try {
        // Create smart account
        console.log('Creating smart account...');
        const smartAccount = await toMetaMaskSmartAccount({
            client: publicClient,
            implementation: Implementation.Hybrid,
            deployParams: [account.address, [], [], []],
            deploySalt: '0x0000000000000000000000000000000000000000000000000000000000000000',
            signer: { walletClient }
        });

        console.log('Smart Account created!');
        console.log('Owner EOA:', account.address);
        console.log('Smart Account Address:', smartAccount.address);

        // Check if smart account is deployed
        const code = await publicClient.getCode({ address: smartAccount.address });
        console.log('Smart Account deployed:', code && code !== '0x');

        // Get nonce
        try {
            const nonce = await smartAccount.getNonce();
            console.log('Current nonce:', nonce);
        } catch (error) {
            console.log('Error getting nonce:', error.message);
        }

        // Try a simple operation first - just check balance
        console.log('\n=== TESTING SIMPLE OPERATION ===');
        
        const bundlerClient = createBundlerClient({
            client: publicClient,
            transport: http('https://monad-testnet.g.alchemy.com/v2/' + process.env.ALCHEMY_API_KEY),
        });

        const paymasterClient = createPaymasterClient({
            transport: http('https://monad-testnet.g.alchemy.com/v2/' + process.env.ALCHEMY_API_KEY),
        });

        // Now test the actual subscription calls
        const SubscriptionManagerAddress = deploymentAdress.SUBSCRIPTION_MANAGER;
        const SubscriptionManagerABI = SubscriptionManager.abi;
        const tokenAddress = deploymentAdress.USDC_ADDRESS;

        console.log('Testing subscription calls...');
        
        // Test 1: Token approval with reasonable amount (not MAX)
        console.log('\n=== TEST 1: Token Approval ===');
        const erc20Abi = [
            {
                "inputs": [
                    { "internalType": "address", "name": "spender", "type": "address" },
                    { "internalType": "uint256", "name": "amount", "type": "uint256" }
                ],
                "name": "approve",
                "type": "function"
            }
        ];

        // Use a reasonable amount instead of MAX_UINT256
        const approvalAmount = 1000000000000000000n; // 1 token with 18 decimals
        
        const approveCallData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [SubscriptionManagerAddress, approvalAmount]
        });

        try {
            const approveHash = await bundlerClient.sendUserOperation({
                account: smartAccount,
                calls: [{
                    to: tokenAddress,
                    data: approveCallData,
                    value: 0n
                }],
                paymaster: paymasterClient,
                paymasterContext: {
                    policyId: process.env.ALCHEMY_POLICY_ID,
                },
            });
            
            console.log('✅ Token approval successful:', approveHash);
            
            // Wait a bit before next operation
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Test 2: Subscribe call
            console.log('\n=== TEST 2: Subscribe Call ===');
            const subscribeCallData = encodeFunctionData({
                abi: SubscriptionManagerABI,
                functionName: 'subscribeWithPayment',
                args: [1n] // Plan ID 1
            });

            const subscribeHash = await bundlerClient.sendUserOperation({
                account: smartAccount,
                calls: [{
                    to: SubscriptionManagerAddress,
                    data: subscribeCallData,
                    value: 0n
                }],
                paymaster: paymasterClient,
                paymasterContext: {
                    policyId: process.env.ALCHEMY_POLICY_ID,
                },
            });
            
            console.log('✅ Subscription successful:', subscribeHash);
            
        } catch (error) {
            console.error('❌ Operation failed:', error.message);
            console.error('Full error:', error);
        }

    } catch (error) {
        console.error('Error in debug:', error.message);
        console.error('Full error:', error);
    }
}

debugSmartAccount().catch(console.error);
