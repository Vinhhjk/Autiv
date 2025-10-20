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
} from 'viem';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import deploymentAdress from '../deployment-addresses.json' with { type: 'json' };
import { getDelegationHashOffchain } from '@metamask/delegation-toolkit/utils';
const MONAD_TESTNET_CHAIN_ID = 10143;

async function disableDelegation() {
    console.log('Disabling Delegation from User Side');

    // Load EOA private key (user's EOA)
    const account = privateKeyToAccount(process.env.TEST_EOA_FOR_SUB);
    const transport = http();
    // Create clients
    const publicClient = createPublicClient({
        transport,
        chain: monadTestnet,
      });
      const walletClient = createWalletClient({
        account,
        transport,
        chain: monadTestnet,
      });

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
    // Create bundler client for user operations
    const bundlerClient = createBundlerClient({
        client: publicClient,
        transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
    });
    const paymasterClient = createPaymasterClient({
        transport: http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
    });

    console.log('User EOA:', account.address);
    console.log('User Smart Account:', smartAccount.address);
    try {
        // The delegation that was previously created (copy from your test_subscribe.js output)
        const delegationToDisable = {
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
            "salt": "1760357528892",
            "signature": "0xd9c76ba5a7b3f053354be45ee18b625411718b963af05b260743ad639532bb8c71b1e57b41f7ebd30245fbd112261d45b229a1d91114fe4d67d9aff8ccc6f3b11b"
        }
        const environment = getDeleGatorEnvironment(MONAD_TESTNET_CHAIN_ID);
        if (!environment) {
            throw new Error('Delegation environment not found for Monad Testnet');
        }

        console.log('=== DISABLING DELEGATION ===');
        // Encode the disableDelegation call
        const disableDelegationCalldata = DelegationManager.encode.disableDelegation({
            delegation: delegationToDisable,
        });

        console.log('Sending disable delegation transaction...');
        // Send user operation to disable delegation
        const userOperationHash = await bundlerClient.sendUserOperation({
            account: smartAccount,
            calls: [{
                to: environment.DelegationManager,
                data: disableDelegationCalldata,
            }],
            paymaster: paymasterClient,
            paymasterContext: {
               policyId: process.env.ALCHEMY_POLICY_ID,
            },
        });
        console.log('Waiting for disable delegation confirmation...');
        const receipt = await bundlerClient.waitForUserOperationReceipt({
            hash: userOperationHash,
        });

        console.log('Delegation disabled successfully!');
        console.log('Transaction Hash:', receipt.receipt.transactionHash);
        console.log('Block Number:', receipt.receipt.blockNumber);

        return {
            success: true,
            txHash: receipt.receipt.transactionHash,
            blockNumber: receipt.receipt.blockNumber
        };

    } catch (error) {
        console.error('Error disabling delegation:', error.message);
        throw error;
    }
}
// Run if this file is executed directly
disableDelegation().catch(console.error);
