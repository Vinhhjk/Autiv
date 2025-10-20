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
  encodeFunctionData,
} from 'viem';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createDelegation } from '@metamask/delegation-toolkit';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };
import deploymentAdress from '../deployment-addresses.json' with { type: 'json' };

// Load EOA private key
const account = privateKeyToAccount(process.env.TEST_EOA_FOR_SUB);

const MONAD_TESTNET_CHAIN_ID = 10143;

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
async function main() {
  const SubscriptionManagerAddress = deploymentAdress.SUBSCRIPTION_MANAGER;
  const tokenAddress = deploymentAdress.USDC_ADDRESS;
  const SubscriptionManagerABI = SubscriptionManager.abi;

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
    {
      inputs: [
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
      ],
      name: 'transfer',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'owner', type: 'address' },
        { internalType: 'address', name: 'spender', type: 'address' },
      ],
      name: 'allowance',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];

  // Get the EOA address
  const address = await walletClient.getAddresses();
  const owner = address[0];

  // Create a MetaMask Smart Account
  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [owner, [], [], []],
    deploySalt: '0x',
    signer: { walletClient },
  });

  console.log('Smart Account created!');
  console.log('Owner EOA:', owner);
  console.log('Smart Account Address:', smartAccount.address);

  // Execute with SmartAccount + Gas sponsor
  const bundlerClient = createBundlerClient({
    client: publicClient,
    transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
  });

  const paymasterClient = createPaymasterClient({
    transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
  });

  // --- Parallelized read calls ---
  console.log('=== Checking for Existing Subscription ===');

  try {
    const plan_to_subscribe = 1n;

    const multicallResults = await publicClient.multicall({
        contracts: [
        {
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getUserSubscription',
            args: [smartAccount.address],
        },
        {
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'isPaymentDue',
            args: [smartAccount.address],
        },
        {
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getPlan',
            args: [plan_to_subscribe],
        },
        ],
    });

    const [subRes, dueRes, planRes] = multicallResults;

    if (subRes.status !== 'success' || dueRes.status !== 'success' || planRes.status !== 'success') {
        throw new Error('Multicall failed on one or more reads');
    }

    const existingSubscription = subRes.result;
    const isPaymentDueResult = dueRes.result;
    const planDetails = planRes.result;

    console.log('isPaymentDue:', isPaymentDueResult);
    console.log('Plan Name:', planDetails.name);
    console.log('Plan Price:', planDetails.price.toString());
    console.log('Token Address:', planDetails.tokenAddress);

    // Check if user has an ACTIVE subscription - cancel it first
    if (existingSubscription.planId !== 0n && existingSubscription.active === true) {
      console.log('User already has an ACTIVE subscription - canceling it first');
      console.log('Current Plan ID:', existingSubscription.planId.toString());
      console.log('Active Status:', existingSubscription.active ? 'ACTIVE' : 'INACTIVE');

      const cancelCalls = [];
      const approveCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [SubscriptionManagerAddress, 0],
      });
      cancelCalls.push({
        to: tokenAddress,
        data: approveCallData,
      });

      // Skip delegation disable since it's already disabled
      console.log('=== SKIPPING DISABLE DELEGATION CALL ===');
      console.log('Delegation is already disabled - proceeding with subscription cancellation only');
      let delegationDisabled = true; // Mark as already disabled

      // Cancel the active subscription
      console.log('=== CANCELLING ACTIVE SUBSCRIPTION ===');
      const cancelCallData = encodeFunctionData({
        abi: SubscriptionManagerABI,
        functionName: 'cancelSubscription',
        args: [],
      });

      cancelCalls.push({
        to: SubscriptionManagerAddress,
        data: cancelCallData,
      });

      const cancelUserOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: cancelCalls,
        paymaster: paymasterClient,
        paymasterContext: {
          policyId: process.env.ALCHEMY_POLICY_ID,
        },
      });

      console.log('Waiting for cancellation confirmation...');
      try {
        const cancelReceipt = await bundlerClient.waitForUserOperationReceipt({
          hash: cancelUserOpHash,
        });

        console.log('Cancellation confirmed!');
        console.log('Transaction Hash:', cancelReceipt.receipt.transactionHash);
        if (delegationDisabled) {
          console.log('Active subscription cancelled successfully (delegation was already disabled)!');
        } else {
          console.log('Active subscription cancelled successfully!');
        }
        return;
      } catch (executionError) {
        console.log('Warning: Cancellation user operation failed:', executionError.message);
        console.log('This might be due to an issue with the subscription cancellation');
        console.log('Checking if subscription was actually cancelled...');

        // Check if subscription is still active after failed cancellation
        try {
          const checkSubscription = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getUserSubscription',
            args: [smartAccount.address],
          });

          if (checkSubscription.planId === 0n || !checkSubscription.active) {
            console.log('Subscription appears to be cancelled despite user operation failure');
            console.log('This suggests the subscription cancellation succeeded');
            return;
          } else {
            console.log('Subscription is still active - cancellation may have failed');
            throw executionError;
          }
        } catch (checkError) {
          console.log('Could not verify subscription status:', checkError.message);
          throw executionError;
        }
      }
    }

    // Check if we should subscribe (no subscription OR inactive subscription)
    const shouldSubscribe =
      existingSubscription.planId === 0n ||
      existingSubscription.planId.toString() === '0' ||
      !existingSubscription.active;

    if (shouldSubscribe) {
      if (existingSubscription.planId === 0n || existingSubscription.planId.toString() === '0') {
        console.log('No subscription found - proceeding with subscription');
      } else {
        console.log('Found INACTIVE subscription - proceeding with subscription');
        console.log('Current Plan ID:', existingSubscription.planId.toString());
        console.log('Active Status:', existingSubscription.active ? 'ACTIVE' : 'INACTIVE');
      }

      console.log('=== SUBSCRIBING TO PLAN ===');
      console.log('Plan ID to subscribe:', plan_to_subscribe);

      // Prepare subscription calls array
      const calls = [];

      // 1. Token approval call - approve the subscription manager to spend MAX amount for future payments
      console.log('=== APPROVING MAX TOKEN SPEND ===');
      const MAX_UINT256 = (1n << 256n) - 1n; // Maximum possible value
      const approveCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [SubscriptionManagerAddress, MAX_UINT256],
      });
      calls.push({
        to: planDetails.tokenAddress,
        data: approveCallData,
      });
      console.log('Approving MAX tokens for SubscriptionManager (unlimited future payments)');

      // 2. Subscribe call
      console.log('=== CREATING SUBSCRIPTION ===');
      const subscribeCallData = encodeFunctionData({
        abi: SubscriptionManagerABI,
        functionName: 'subscribeWithPayment',
        args: [plan_to_subscribe],
      });
      calls.push({
        to: SubscriptionManagerAddress,
        data: subscribeCallData,
      });
      console.log('Creating subscription for Plan ID:', plan_to_subscribe);

      // 3. Execute transaction
      console.log('=== EXECUTING TRANSACTION ===');
      console.log('Total calls to execute:', calls.length);
      console.log('Calls:', calls);
      const userOperationHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: calls,
        paymaster: paymasterClient,
        paymasterContext: {
          policyId: process.env.ALCHEMY_POLICY_ID,
        },
      });

      console.log('Waiting for user operation confirmation...');
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOperationHash,
      });
      console.log('UserOperation confirmed!');
      console.log('Transaction Hash:', receipt.receipt.transactionHash);
      console.log('Subscription created successfully!');

      // Create processPayment delegation for SubscriptionManager
      console.log('=== CREATING PROCESSPAYMENT DELEGATION ===');
      const AGENT_WALLET = '0x406b16A36926814305dF25757c93d298b639Bef0';

      const processPaymentDelegation = createDelegation({
        to: AGENT_WALLET,
        from: smartAccount.address,
        environment: smartAccount.environment,
        scope: {
          type: 'functionCall',
          targets: [SubscriptionManagerAddress],
          selectors: ['processPayment(address)'],
        },
        salt: Math.floor(Date.now() / 1000),
      });

      console.log('ProcessPayment delegation created:', processPaymentDelegation);

      const processPaymentSignature = await smartAccount.signDelegation({
        delegation: processPaymentDelegation,
      });

      const signedProcessPaymentDelegation = {
        ...processPaymentDelegation,
        signature: processPaymentSignature,
      };

      console.log('=== SIGNED PROCESSPAYMENT DELEGATION ===');
      console.log(JSON.stringify(signedProcessPaymentDelegation, null, 2));

      console.log('\nSubscription created with MAX approval and processPayment delegation');
      return {
        subscriptionTxHash: receipt.receipt.transactionHash,
        processPaymentDelegation: signedProcessPaymentDelegation,
      };
    }
  } catch (error) {
    console.error('Error: ', error.message);
  }
}

main().catch(console.error);
