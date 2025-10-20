import dotenv from 'dotenv';
dotenv.config();

import {
    http,
    createPublicClient,
    createWalletClient,
    encodeFunctionData
} from 'viem';
import { createBundlerClient, createPaymasterClient  } from 'viem/account-abstraction';

import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getDeleGatorEnvironment, ExecutionMode, createExecution, createDelegation } from '@metamask/delegation-toolkit';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };

// Load your EOA private key
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

async function main() {
    const SubscriptionManagerAddress = "0xc0f7E3f8211EAd60964CA9c491F6C9789f3901d4";
    const SubscriptionManagerABI = SubscriptionManager.abi;
    const erc20Abi = [
        {
          "inputs": [
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
          ],
          "name": "approve",
          "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
          ],
          "name": "transfer",
          "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            { "internalType": "address", "name": "owner", "type": "address" },
            { "internalType": "address", "name": "spender", "type": "address" }
          ],
          "name": "allowance",
          "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
          "stateMutability": "view",
          "type": "function"
        }
      ];
      
    const tokenAddress = '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B'
    // Get the EOA address
    const address = await walletClient.getAddresses();
    const owner = address[0];

    // Create a MetaMask Smart Account
    const smartAccount = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [owner, [], [], []],
        deploySalt: "0x",
        signer: { walletClient },
    });

    console.log("Smart Account created!");
    console.log("Owner EOA:", owner);
    console.log("Smart Account Address:", smartAccount.address);

    //Execute with SmartAccount + Gas sponsor
    const bundlerClient = createBundlerClient({
        client: publicClient,
        transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
    });

    const paymasterClient = createPaymasterClient({
        transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
    });
        
    // Check for existing subscription (active or expired)
    console.log('=== Checking for Existing Subscription ===');
    try{
        const existingSubscription = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getUserSubscription',
            args: [smartAccount.address]
        });
        // Also check the contract's isPaymentDue function
        const isPaymentDueResult = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'isPaymentDue',
            args: [smartAccount.address]
        });
        console.log('Contract isPaymentDue result:', isPaymentDueResult);
        // Check if user has an ACTIVE subscription - cancel it first
        if (existingSubscription.planId !== 0n && existingSubscription.active === true) {
            console.log("User already has an ACTIVE subscription - canceling it first");
            console.log('Current Plan ID:', existingSubscription.planId.toString());
            console.log('Active Status:', existingSubscription.active ? 'ACTIVE' : 'INACTIVE');
            

            const cancelCalls =[]
            const approveCallData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [SubscriptionManagerAddress, 0]
            });
            cancelCalls.push({
                to:tokenAddress,
                data:approveCallData
            })
            // Cancel the active subscription
            console.log('=== CANCELLING ACTIVE SUBSCRIPTION ===');
            const cancelCallData = encodeFunctionData({
                abi: SubscriptionManagerABI,
                functionName: 'cancelSubscription',
                args: []
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
            const cancelReceipt = await bundlerClient.waitForUserOperationReceipt({
                hash: cancelUserOpHash,
            });
            
            console.log('Cancellation confirmed!');
            console.log('Transaction Hash:', cancelReceipt.receipt.transactionHash);
            console.log('Active subscription cancelled successfully!');

            // //Verify Approval is 0
            // console.log('=== VERIFYING APPROVAL RESET ===');

            // const allowance = await publicClient.readContract({
            // address: tokenAddress,
            // abi: erc20Abi,
            // functionName: 'allowance',
            // args: [smartAccount.address, SubscriptionManagerAddress],
            // });

            // console.log(`Allowance for SubscriptionManager: ${allowance} tokens`);

            // if (allowance === 0n) {
            // console.log('Approval successfully reset to 0!');
            // } else {
            // console.log('Approval not reset, current allowance =', allowance.toString());
            // }
            return
        }
        
        // Check if we should subscribe (no subscription OR inactive subscription)
        const shouldSubscribe = (existingSubscription.planId === 0n || existingSubscription.planId.toString() === '0') || !existingSubscription.active;
        
        if (shouldSubscribe) {
            if (existingSubscription.planId === 0n || existingSubscription.planId.toString() === '0') {
                console.log("No subscription found - proceeding with subscription");
            } else {
                console.log("Found INACTIVE subscription - proceeding with subscription");
                console.log('Current Plan ID:', existingSubscription.planId.toString());
                console.log('Active Status:', existingSubscription.active ? 'ACTIVE' : 'INACTIVE');
            }
            
            // TODO: Add subscription logic here
            const plan_to_subscribe = 1n;
            console.log('=== SUBSCRIBING TO PLAN ===');
            console.log('Plan ID to subscribe:', plan_to_subscribe);
            const planDetails = await publicClient.readContract({
                address: SubscriptionManagerAddress,
                abi: SubscriptionManagerABI,
                functionName: 'getPlan',
                args: [plan_to_subscribe]
            });      
            console.log('Plan Name:', planDetails.name);
            console.log('Plan Price:', planDetails.price.toString(), 'tokens');
            console.log('Token Address:', planDetails.tokenAddress);
            
            // Prepare subscription calls array
            const calls = [];
            
            // 1. Token approval call - approve the subscription manager to spend the plan price
            console.log('=== APPROVING TOKEN SPEND ===');
            // const MAX_UINT256 = (1n << 256n) - 1n;
            const approveCallData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [SubscriptionManagerAddress, planDetails.price]
            });
            calls.push({ 
                to: planDetails.tokenAddress, 
                data: approveCallData 
            });
            console.log('Approving', planDetails.price.toString(), 'tokens for SubscriptionManager');
            
            // 2. Subscribe call
            console.log('=== CREATING SUBSCRIPTION ===');
            const subscribeCallData = encodeFunctionData({
                abi: SubscriptionManagerABI,
                functionName: 'subscribeWithPayment',
                args: [plan_to_subscribe]
            });
            calls.push({ 
                to: SubscriptionManagerAddress, 
                data: subscribeCallData 
            });
            console.log('Creating subscription for Plan ID:', plan_to_subscribe);
            
            // 3. Execute transaction
            console.log('=== EXECUTING TRANSACTION ===');
            console.log('Total calls to execute:', calls.length);
            
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

            // Create approve delegation for SubscriptionManager to spend tokens
            console.log('=== CREATING APPROVE DELEGATION ===');

            const APPROVE_AGENT_WALLET = "0x406b16A36926814305dF25757c93d298b639Bef0";

            // Create delegation that allows SubscriptionManager to approve token spending
            const approveDelegation = createDelegation({
                to: APPROVE_AGENT_WALLET,
                from: smartAccount.address,
                environment: smartAccount.environment,
                scope: {
                    type: 'functionCall',
                    targets: [tokenAddress],
                    selectors: ['approve(address,uint256)'],
                },
                salt: Date.now().toString(), // Unique salt
            });

            console.log('Approve delegation created:', approveDelegation);

            // Sign the approve delegation
            const approveSignature = await smartAccount.signDelegation({
                delegation: approveDelegation,
            });

            const signedApproveDelegation = {
                ...approveDelegation,
                signature: approveSignature,
            };

            console.log('=== SIGNED APPROVE DELEGATION ===');
            console.log(JSON.stringify(signedApproveDelegation, null, 2));

            console.log('\n🎉 Subscription, processPayment delegation, and approve delegation created successfully!');
            console.log('💡 Run process_payment_with_delegation.js to process the payment using these delegations.');

            return {
                subscriptionTxHash: receipt.receipt.transactionHash,
                approveDelegation: signedApproveDelegation
            };

        }
    } catch (error) {
        console.error('Error: ', error.message);
    }

}

main().catch(console.error);
