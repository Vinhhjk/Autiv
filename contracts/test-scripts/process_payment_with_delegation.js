import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };
import { getDeleGatorEnvironment, ExecutionMode, createExecution } from '@metamask/delegation-toolkit';
import { DelegationManager } from "@metamask/delegation-toolkit/contracts"

const SubscriptionManagerABI = SubscriptionManager.abi;
const RPC_URL = 'https://testnet-rpc.monad.xyz';
const MONAD_TESTNET_CHAIN_ID = 10143;

async function processPaymentWithDelegation() {
    console.log('MetaMask Delegation Payment Processor');

    // Setup provider + wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const agent = new ethers.Wallet(process.env.EOA_PRIVATE_KEY, provider);
    const target_address = "0x9D54F12eb708645a99C0356387BC76846C3CA802"; // User smart account

    console.log('Agent Address:', agent.address);
    console.log('Target User Address:', target_address);

    // Setup contract
    const SubscriptionManagerAddress = "0xc0f7E3f8211EAd60964CA9c491F6C9789f3901d4";

    // Contract instance with agent (for payment processing)
    const SubscriptionManagerAsAgent = new ethers.Contract(
        SubscriptionManagerAddress,
        SubscriptionManagerABI,
        agent
    );

    console.log('\n=== Checking Payment Status ===');
    const isPaymentDue = await SubscriptionManagerAsAgent.isPaymentDue(target_address);
    console.log('Is Payment Due:', isPaymentDue);

    if (isPaymentDue) {
        console.log('\n=== Processing Payment with MetaMask Delegation ===');

        try {
            // Get user's subscription details to know payment amount
            const subscription = await SubscriptionManagerAsAgent.getUserSubscription(target_address);
            const planDetails = await SubscriptionManagerAsAgent.getPlan(subscription.planId);

            console.log('Payment details:', {
                planId: subscription.planId.toString(),
                amount: planDetails.price.toString(),
                token: planDetails.tokenAddress
            });

            // Use the approve delegation data from test script
            const signedApproveDelegation ={
                "delegate": "0x406b16A36926814305dF25757c93d298b639Bef0",
                "delegator": "0x9D54F12eb708645a99C0356387BC76846C3CA802",
                "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                "caveats": [
                  {
                    "enforcer": "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
                    "terms": "0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B",
                    "args": "0x"
                  },
                  {
                    "enforcer": "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
                    "terms": "0x095ea7b3",
                    "args": "0x"
                  }
                ],
                "salt": "1760092993113",
                "signature": "0x174252ddfba21e439b3b1dd8fa950a60c0a5bd1622940c3e683401fc7cecea1b7d00c8360d796a5d1f49bfa96081f40428b7d6be599209ba5f50d2b555b505be1b"
              };

            const environment = getDeleGatorEnvironment(MONAD_TESTNET_CHAIN_ID);
            if (!environment) {
                throw new Error('Delegation environment not found for Monad Testnet');
            }

            // Step 1: Approve SubscriptionManager to spend tokens using approve delegation
            console.log('=== STEP 1: APPROVING SUBSCRIPTIONMANAGER TO SPEND TOKENS ===');

            // Create token contract instance for approve function
            const tokenContract = new ethers.Contract(
                planDetails.tokenAddress,
                ['function approve(address spender, uint256 amount) returns (bool)'],
                agent
            );

            const approveCalldata = tokenContract.interface.encodeFunctionData(
                'approve',
                [SubscriptionManagerAddress, planDetails.price]
            );

            const approveExecution = createExecution({
                target: planDetails.tokenAddress,
                value: 0n,
                callData: approveCalldata
            });

            console.log('Approve calldata length:', approveCalldata.length);

            // Use approve delegation to approve token spending
            const approveCalldataFull = DelegationManager.encode.redeemDelegations({
                delegations: [[signedApproveDelegation]],
                modes: [ExecutionMode.SingleDefault],
                executions: [[approveExecution]],
            });

            console.log('Sending approve via delegation...');
            const approveTx = await agent.sendTransaction({
                to: environment.DelegationManager,
                data: approveCalldataFull,
                gasLimit: 1000000
            });

            console.log('Approve TX hash:', approveTx.hash);
            const approveReceipt = await approveTx.wait();
            console.log('SubscriptionManager approved to spend tokens');

            // Step 2: Call processPayment directly (SubscriptionManager now has approval)
            console.log('=== STEP 2: CALLING PROCESSPAYMENT DIRECTLY ===');

            const processPaymentCalldata = SubscriptionManagerAsAgent.interface.encodeFunctionData(
                'processPayment',
                [target_address]
            );

            console.log('Calling processPayment function directly...');
            const processTx = await agent.sendTransaction({
                to: SubscriptionManagerAddress,
                data: processPaymentCalldata,
            });

            console.log('Process payment TX hash:', processTx.hash);
            const processReceipt = await processTx.wait();
            console.log('Process payment completed in block:', processReceipt.blockNumber);

            // Check final status
            const finalSubscription = await SubscriptionManagerAsAgent.getUserSubscription(target_address);
            console.log('Final Subscription Status:', {
                planId: finalSubscription.planId.toString(),
                startTime: new Date(Number(finalSubscription.startTime) * 1000).toLocaleString(),
                lastPayment: new Date(Number(finalSubscription.lastPayment) * 1000).toLocaleString(),
                active: finalSubscription.active,
                delegator: finalSubscription.delegator
            });

            const isStillDue = await SubscriptionManagerAsAgent.isPaymentDue(target_address);
            console.log('Is Payment Still Due:', isStillDue);

            console.log('\nPayment completed!');
            return {
                success: true,
                approveTxHash: approveTx.hash,
                processTxHash: processTx.hash,
                approveBlockNumber: approveReceipt.blockNumber,
                processBlockNumber: processReceipt.blockNumber
            };

        } catch (error) {
            console.error('❌ Delegation payment failed:', error.message);
            throw error;
        }
    } else {
        console.log('Payment is not due yet');
        console.log('Delegation system is ready for when payment becomes due');
        return {
            success: false,
            reason: 'Payment not due'
        };
    }
}

// Run if this file is executed directly
processPaymentWithDelegation().catch(console.error);
