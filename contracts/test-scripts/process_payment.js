import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };

const SubscriptionManagerABI = SubscriptionManager.abi;
const RPC_URL = 'https://testnet-rpc.monad.xyz';

async function processPayment() {
    // Setup provider + wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const deployer = new ethers.Wallet(process.env.DEPLOYER_EOA_PRIVATE_KEY, provider);
    const agent = new ethers.Wallet(process.env.EOA_PRIVATE_KEY, provider);

    const target_address = "0x9D54F12eb708645a99C0356387BC76846C3CA802";
    console.log('Agent Address:', agent.address);
    console.log('Deployer Address:', deployer.address);

    // Setup contract
    const SubscriptionManagerAddress = "0xc0f7E3f8211EAd60964CA9c491F6C9789f3901d4";
    
    // Contract instance with deployer (for authorization)
    const SubscriptionManagerAsDeployer = new ethers.Contract(
        SubscriptionManagerAddress,
        SubscriptionManagerABI,
        deployer
    );
    
    // Contract instance with agent (for payment processing)
    const SubscriptionManagerAsAgent = new ethers.Contract(
        SubscriptionManagerAddress,
        SubscriptionManagerABI,
        agent
    );

    // Step 1: Check if agent is already authorized
    console.log('\n=== Checking Authorization ===');
    const isAuthorized = await SubscriptionManagerAsDeployer.authorizedExecutors(agent.address);
    console.log('Agent authorized:', isAuthorized);

    // Step 2: Authorize agent if not already authorized
    if (!isAuthorized) {
        console.log('\n=== Authorizing Agent ===');
        const authTx = await SubscriptionManagerAsDeployer.authorizeExecutor(agent.address, true);
        console.log('Authorization tx sent:', authTx.hash);
        const authReceipt = await authTx.wait();
        console.log('Authorization confirmed in block:', authReceipt.blockNumber);
        console.log('Agent is now authorized to process payments');
    } else {
        console.log('Agent is already authorized');
    }

    // Step 3: Check if payment is due
    console.log('\n=== Checking Payment Status ===');
    const isPaymentDue = await SubscriptionManagerAsAgent.isPaymentDue(target_address);
    console.log('Is Payment Due:', isPaymentDue);
    
    // Step 4: Process payment if due
    if (isPaymentDue) {
        console.log('\n=== Processing Payment ===');
        const tx = await SubscriptionManagerAsAgent.processPayment(target_address);
        console.log('Payment tx sent:', tx.hash);
        const receipt = await tx.wait();
        console.log('Payment confirmed in block:', receipt.blockNumber);
        console.log('Payment processed successfully!');
        const subscription = await SubscriptionManagerAsAgent.subscriptions(target_address);
        console.log('Subscription:', subscription);
        const isPaymentDue = await SubscriptionManagerAsAgent.isPaymentDue(target_address);
        console.log('Is Payment Due:', isPaymentDue);
    } else {
        console.log('Payment is not due yet');
    }
}

processPayment();
