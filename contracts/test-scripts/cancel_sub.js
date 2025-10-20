import dotenv from 'dotenv';
dotenv.config();
import {
    http,
    createPublicClient,
    createWalletClient,
    encodeFunctionData
} from 'viem';

import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };
const SubscriptionManagerABI = SubscriptionManager.abi;
const account = privateKeyToAccount(process.env.TEST_EOA_FOR_SUB);

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
    const SubscriptionManagerAddress = "0xc0f7E3f8211EAd60964CA9c491F6C9789f3901d4";
    
    // Check for existing subscription (active or expired)
    console.log('=== Checking for Existing Subscription ===');
    let hasSubscription = false;
    let subscriptionDetails = null;
    
    try {
        const existingSubscription = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getUserSubscription',
            args: [smartAccount.address]
        });
        
        hasSubscription = true;
        subscriptionDetails = existingSubscription;
        
        console.log('Found subscription:');
        console.log('Current Plan ID:', existingSubscription.planId.toString());
        console.log('Start Time:', new Date(Number(existingSubscription.startTime) * 1000).toLocaleString());
        console.log('Last Payment:', new Date(Number(existingSubscription.lastPayment) * 1000).toLocaleString());
        console.log('Active Status:', existingSubscription.active ? 'ACTIVE' : 'INACTIVE');
        console.log('Delegator:', existingSubscription.delegator);
        
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
            args: [existingSubscription.planId]
        });
        
        console.log('Plan Details:');
        console.log('Plan Name:', planDetails.name);
        console.log('Price:', planDetails.price.toString(), 'tokens');
        console.log('Period:', planDetails.period.toString(), 'seconds');
        console.log('Period (days):', Math.floor(Number(planDetails.period) / 86400), 'days');
        console.log('Plan Active:', planDetails.active);
        console.log('Token Address:', planDetails.tokenAddress);
        
        // Calculate next payment due date
        if (existingSubscription.active) {
            const nextPaymentTime = Number(existingSubscription.lastPayment) + Number(planDetails.period);
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
        console.log('No subscription found or error checking:', error.message);
        hasSubscription = false;
    }
    
    // If no subscription found, exit
    if (!hasSubscription) {
        console.log('No subscription found to cancel. Exiting...');
        return;
    }
    
    // Prepare calls array for cancellation only
    const calls = [];
    
    // Cancel the subscription
    console.log('Preparing to cancel subscription...');
    const cancelCallData = encodeFunctionData({
        abi: SubscriptionManagerABI,
        functionName: 'cancelSubscription',
        args: []
    });
    
    calls.push({
        to: SubscriptionManagerAddress,
        data: cancelCallData,
    });
    
    console.log('=== Smart Account Subscription Cancellation ===');
    console.log('Smart Account Address:', smartAccount.address);
    console.log('Subscription Manager:', SubscriptionManagerAddress);

    const userOperationHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: calls,
        paymaster: paymasterClient,
        paymasterContext: {
            policyId: process.env.ALCHEMY_POLICY_ID,
        },
    });
    
    console.log('Subscription cancellation transaction submitted!');
    console.log('UserOperation Hash:', userOperationHash);
    console.log('Transaction will be sponsored by Alchemy Gas Manager');

    console.log('Waiting for user operation confirmation...');
    const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOperationHash,
    });
    
    console.log('UserOperation confirmed!');
    console.log('Transaction Hash:', receipt.receipt.transactionHash);
    console.log('Subscription cancelled successfully!');
    
    // Verify cancellation was successful
    console.log('\n=== Verifying Cancellation ===');
    
    try {
        const cancelledSubscription = await publicClient.readContract({
            address: SubscriptionManagerAddress,
            abi: SubscriptionManagerABI,
            functionName: 'getUserSubscription',
            args: [smartAccount.address]
        });
        
        console.log('Final Subscription Status:');
        console.log('Active:', cancelledSubscription.active);
        console.log('Plan ID:', cancelledSubscription.planId.toString());
        console.log('Start Time:', new Date(Number(cancelledSubscription.startTime) * 1000).toLocaleString());
        console.log('Last Payment:', new Date(Number(cancelledSubscription.lastPayment) * 1000).toLocaleString());
        
        if (!cancelledSubscription.active) {
            console.log('✅ Subscription successfully cancelled!');
        } else {
            console.log('⚠️  Subscription still appears active - please check manually');
        }
        
    } catch (error) {
        console.log('Error verifying cancellation:', error.message);
    }
}
main();

