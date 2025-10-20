import dotenv from 'dotenv';
dotenv.config();
import {
    http,
    createPublicClient,
    createWalletClient,
    parseUnits,
    encodeFunctionData
} from 'viem';

import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };// Define the ABI for the ERC20 functions
const erc20Abi = [
    {
        "inputs": [
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "transfer",
        "outputs": [
            { "internalType": "bool", "name": "", "type": "bool" }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [
            { "internalType": "bool", "name": "", "type": "bool" }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];
const SubscriptionManagerABI = SubscriptionManager.abi;
const account = privateKeyToAccount(process.env.EOA_PRIVATE_KEY);

const transport = http();
const publicClient = createPublicClient({
    transport,
    chain: monadTestnet
});
const walletClient = createWalletClient({
    account,
    transport,
    chain: monadTestnet
});

async function main() {
    const address = await walletClient.getAddresses();
    const owner = address[0];
    const smartAccount = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [owner, [], [], []],
        deploySalt: "0x",
        signer: { walletClient },
    });

    const bundlerClient = createBundlerClient({
        client: publicClient,
        transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
    });

    const paymasterClient = createPaymasterClient({
        transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
    });
    
    // Contract addresses
    const SubscriptionManagerAddress = "0xae5f5c40a6b685f5a87e4fbd4e3f63588571a29c";
    const tokenAddress = "0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B";
    
    // Plan ID and token amount
    const planId = 1;
    const tokenAmount = parseUnits("1", 18);
    
    // Check if user already has a subscription
    console.log('=== Checking Existing Subscription ===');
    let hasActiveSubscription = false;
    
    try {
        const existingSubscription = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getUserSubscription',
            args: [smartAccount.address]
        });
        
        hasActiveSubscription = existingSubscription.active;
        
        if (hasActiveSubscription) {
            console.log('User already has an active subscription:');
            console.log('Current Plan ID:', existingSubscription.planId.toString());
            console.log('Start Time:', new Date(Number(existingSubscription.startTime) * 1000).toLocaleString());
            console.log('Last Payment:', new Date(Number(existingSubscription.lastPayment) * 1000).toLocaleString());
            console.log('Will cancel existing subscription and create new one...');
        } else {
            console.log('No active subscription found - proceeding with new subscription');
        }
    } catch (error) {
        console.log('No existing subscription found or error checking:', error.message);
    }
    
    // Prepare calls array
    const calls = [];
    
    // Encode the approve function call
    const approveCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [SubscriptionManagerAddress, tokenAmount]
    });
    
    calls.push({
        to: tokenAddress,
        data: approveCallData,
    });
    
    // If user has active subscription, cancel it first
    if (hasActiveSubscription) {
        console.log('Cancelling existing subscription...');
        const cancelCallData = encodeFunctionData({
            abi: SubscriptionManagerABI,
            functionName: 'cancelSubscription',
            args: []
        });
        
        calls.push({
            to: SubscriptionManagerAddress,
            data: cancelCallData,
        });
    }
    
    // Always create new subscription
    console.log('Creating new subscription...');
    const subscribeCallData = encodeFunctionData({
        abi: SubscriptionManagerABI,
        functionName: 'subscribeWithPayment',
        args: [planId]
    });
    
    calls.push({
        to: SubscriptionManagerAddress,
        data: subscribeCallData,
    });
    
    console.log('=== Smart Account Token Approval and Subscription ===');
    console.log('Smart Account Address:', smartAccount.address);
    console.log('Subscription Manager:', SubscriptionManagerAddress);
    console.log('Token Address:', tokenAddress);
    console.log('Plan ID:', planId);
    console.log('Amount:', tokenAmount.toString(), ' (1 token)');

    const userOperationHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: calls,
        paymaster: paymasterClient,
        paymasterContext: {
            policyId: process.env.ALCHEMY_POLICY_ID,
        },
    });
    
    // Determine action taken for logging
    const actionTaken = hasActiveSubscription ? 'cancellation and new subscription' : 'new subscription';
    
    console.log(`Token approval and ${actionTaken} transaction submitted!`);
    console.log('UserOperation Hash:', userOperationHash);
    console.log('Transaction will be sponsored by Alchemy Gas Manager');

    console.log('Waiting for user operation confirmation...');
    const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOperationHash,
    });
    
    console.log('UserOperation confirmed!');
    console.log('Transaction Hash:', receipt.receipt.transactionHash);
    console.log(`Token approved and ${actionTaken} completed successfully!`);
    
    // Check subscription status after successful subscription
    console.log('\n=== Checking Subscription Status ===');
    
    try {
        // Get user subscription details
        const userSubscription = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getUserSubscription',
            args: [smartAccount.address]
        });
        
        console.log('Subscription Details:');
        console.log('Plan ID:', userSubscription.planId.toString());
        console.log('Start Time:', new Date(Number(userSubscription.startTime) * 1000).toLocaleString());
        console.log('Last Payment:', new Date(Number(userSubscription.lastPayment) * 1000).toLocaleString());
        console.log('Active:', userSubscription.active);
        console.log('Delegator:', userSubscription.delegator);
        
        // Check if payment is due
        const isPaymentDue = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'isPaymentDue',
            args: [smartAccount.address]
        });
        
        console.log('Payment Status:');
        console.log('Payment Due:', isPaymentDue ? 'YES' : 'NO');
        
        // Get plan details
        const planDetails = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getPlan',
            args: [userSubscription.planId]
        });
        
        console.log('Plan Details:');
        console.log('Plan Name:', planDetails.name);
        console.log('Price:', planDetails.price.toString(), 'tokens');
        console.log('Period:', planDetails.period.toString(), 'seconds');
        console.log('Period (days):', Math.floor(Number(planDetails.period) / 86400), 'days');
        console.log('Active:', planDetails.active);
        console.log('Token Address:', planDetails.tokenAddress);
        
        // Calculate next payment due date
        if (userSubscription.active) {
            const nextPaymentTime = Number(userSubscription.lastPayment) + Number(planDetails.period);
            const nextPaymentDate = new Date(nextPaymentTime * 1000);
            console.log('Next Payment Due:', nextPaymentDate.toLocaleString());
            
            const now = Math.floor(Date.now() / 1000);
            const timeUntilDue = nextPaymentTime - now;
            if (timeUntilDue > 0) {
                console.log('Time Until Due:', Math.floor(timeUntilDue / 86400), 'days', Math.floor((timeUntilDue % 86400) / 3600), 'hours');
            } else {
                console.log('Payment is overdue!');
            }
        }
        
    } catch (error) {
        console.log('Error checking subscription status:', error.message);
    }
}
main();

