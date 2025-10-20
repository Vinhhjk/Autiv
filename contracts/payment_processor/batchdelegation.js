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
    const plan_to_subscribe = 1;
    const planRes = await publicClient.readContract({
        address: SubscriptionManagerAddress,
        abi: SubscriptionManagerABI,
        functionName: 'getPlan',
        args: [plan_to_subscribe],
    });
    const planPrice = planRes.price;
    console.log('Plan Price:', planPrice);
    const calls = [];
    const approveCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [SubscriptionManagerAddress, planPrice],
      });
    calls.push({
    to: tokenAddress,
    data: approveCallData,
    });
    const subscribeCallData = encodeFunctionData({
        abi: SubscriptionManagerABI,
        functionName: 'subscribeWithPayment',
        args: [plan_to_subscribe],
      });
    calls.push({
    to: SubscriptionManagerAddress,
    data: subscribeCallData,
    });
    const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls,
        paymaster: paymasterClient,
        paymasterContext: {
          policyId: process.env.ALCHEMY_POLICY_ID,
        },
      });
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });
    console.log('Subscription successful!');
    console.log('Transaction Hash:', receipt.receipt.transactionHash);

    // Create TWO separate delegations (working solution)
    const AGENT_WALLET = '0x406b16A36926814305dF25757c93d298b639Bef0';
    
    // Delegation 1: For approve on token contract
    const approveDelegation = createDelegation({
        to: AGENT_WALLET,
        from: smartAccount.address,
        environment: smartAccount.environment,
        scope: {
          type: 'functionCall',
          targets: [tokenAddress],
          selectors: ['approve(address,uint256)'],
        },
        salt: Math.floor(Date.now() / 1000),
      });

    // Delegation 2: For processPayment on SubscriptionManager
    const processPaymentDelegation = createDelegation({
        to: AGENT_WALLET,
        from: smartAccount.address,
        environment: smartAccount.environment,
        scope: {
          type: 'functionCall',
          targets: [SubscriptionManagerAddress],
          selectors: ['processPayment(address)'],
        },
        salt: Math.floor(Date.now() / 1000) + 1, // Different salt
      });

    const approveSignature = await smartAccount.signDelegation({
        delegation: approveDelegation,
      });
      
    const processPaymentSignature = await smartAccount.signDelegation({
        delegation: processPaymentDelegation,
      });

    const signedApproveDelegation = {
        ...approveDelegation,
        signature: approveSignature,
      };
      
    const signedProcessPaymentDelegation = {
        ...processPaymentDelegation,
        signature: processPaymentSignature,
      };

    console.log('=== SIGNED APPROVE DELEGATION ===');
    console.log(JSON.stringify(signedApproveDelegation, null, 2));
    console.log('\n=== SIGNED PROCESSPAYMENT DELEGATION ===');
    console.log(JSON.stringify(signedProcessPaymentDelegation, null, 2));
}
main();