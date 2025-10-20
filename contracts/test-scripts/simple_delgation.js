import dotenv from 'dotenv';
dotenv.config();

import {
  http,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  zeroAddress,
} from 'viem';
import {
  createBundlerClient,
} from 'viem/account-abstraction';

import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  Implementation,
  toMetaMaskSmartAccount,
  createDelegation,
  ExecutionMode,
  createExecution,
  getDeleGatorEnvironment,
} from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';

// Load EOA private keys
const user_account = privateKeyToAccount(process.env.TEST_EOA_FOR_SUB);
const agent_account = privateKeyToAccount(process.env.EOA_PRIVATE_KEY);

// Transport + clients
const transport = http();
const publicClient = createPublicClient({
  transport,
  chain: monadTestnet,
});

// Create bundler client (required for smart account operations)
const bundlerClient = createBundlerClient({
    client: publicClient,
    transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
});

const agent_walletClient = createWalletClient({
  account: agent_account,
  transport,
  chain: monadTestnet,
});

const tokenAddress = '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B';
const erc20Abi = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

async function main() {
  try {
    // Create the smart account for the user (delegator)
    const user_smart_account = await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Hybrid,
      deployParams: [user_account.address, [], [], []],
      deploySalt: '0x',
      signer: { account: user_account },
    });

    console.log('User EOA:', user_account.address);
    console.log('User smart account address:', user_smart_account.address);
    console.log('Agent EOA:', agent_account.address);

    // CRITICAL: Ensure the smart account is deployed before creating delegation
    // Check if account is deployed, if not deploy it
    const code = await publicClient.getBytecode({ address: user_smart_account.address });
    if (!code || code === '0x') {
      console.log('Smart account not deployed. Deploying...');
      // You may need to deploy the account first using bundler or direct deployment
      // This depends on your specific setup and funding
      throw new Error('Smart account must be deployed before creating delegations. Please deploy the account first.');
    }
    console.log('Smart account is deployed ✓');

    // The amount in "wei units" (token with 18 decimals)
    const amount = 1n * 10n ** 18n; // Start with 1 token for testing

    // Create the delegation so that agent_account can spend up to `amount`
    const delegation = createDelegation({
      to: agent_account.address,
      from: user_smart_account.address,
      environment: user_smart_account.environment,
      scope: {
        type: 'erc20TransferAmount',
        tokenAddress,
        maxAmount: amount,
      },
      caveats: [],
      salt: Date.now().toString(), // Add unique salt to avoid conflicts
    });
    console.log('Delegation created:', delegation);

    // Sign the delegation
    const signature = await user_smart_account.signDelegation({
      delegation,
    });
    const signedDelegation = {
      ...delegation,
      signature,
    };
    console.log('Delegation signed ✓');

    // Create the ERC-20 transfer calldata
    const transferCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [agent_account.address, amount], // Transfer the same amount as delegated
    });

    // Create execution - this represents the actual action to perform
    const execution = createExecution({
      target: tokenAddress,
      callData: transferCalldata,  // Use callData as per the type definition
    });

    console.log('Execution object:', execution);
    console.log('Execution type:', typeof execution);
    console.log('Execution keys:', Object.keys(execution));

    // Use the exact structure from the working delegation example
    const redeemDelegationCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],         // Array containing array of delegations
      modes: [ExecutionMode.SingleDefault],      // Array of modes
      executions: [[execution]],                 // Array of execution arrays
    });

    console.log('Redeeming delegation...');
    
    // Send transaction from agent (the delegate) to invoke DelegationManager
    const txHash = await agent_walletClient.sendTransaction({
      to: getDeleGatorEnvironment(monadTestnet.id).DelegationManager,
      data: redeemDelegationCalldata,
      chain: monadTestnet,
    });

    console.log('Transaction hash for delegated transfer:', txHash);
    console.log('✅ Delegation redeemed successfully!');

  } catch (error) {
    console.error('❌ Error in delegation process:', error);
    
    // Provide specific error guidance
    if (error.message.includes('Smart account must be deployed')) {
      console.log('\n💡 Solution: Deploy your smart account first by sending a transaction from it or using a bundler.');
    } else if (error.message.includes('insufficient funds')) {
      console.log('\n💡 Solution: Ensure your smart account has enough tokens and ETH for gas.');
    } else if (error.message.includes('delegation')) {
      console.log('\n💡 Solution: Check delegation parameters and ensure proper signing.');
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
});
