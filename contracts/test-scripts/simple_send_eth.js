const dotenv = require('dotenv');
dotenv.config();
const { http, createPublicClient, createWalletClient, parseEther } = require('viem');
const { monadTestnet } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const { Implementation, toMetaMaskSmartAccount } = require('@metamask/delegation-toolkit');
const { createBundlerClient, createPaymasterClient } = require('viem/account-abstraction');

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
    
    const targetAddress = "0x51AC36E05CAbD8F40525a314601B540a02bf20a8";
    const amount_eth = parseEther("0.1");
    
    console.log('=== Send 0.1 ETH from Smart Account to Target ===');
    console.log('Smart Account Address:', smartAccount.address);
    console.log('Target Address:', targetAddress);
    console.log('Amount:', amount_eth.toString(), 'wei (0.1 ETH)');

    // The callData is constructed implicitly by the sendUserOperation method.
    // Viem will automatically encode the call to the smart account's 'execute' method.
    const userOperationHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: [
            {
                to: targetAddress,
                value: amount_eth
            }
        ],
        // Pass the paymasterClient directly to the sendUserOperation method
        // This tells viem to use the paymaster for gas sponsorship
        paymaster: paymasterClient,
        // The paymasterContext should specify the policyId for Alchemy Gas Manager
        paymasterContext: {
            policyId: process.env.ALCHEMY_POLICY_ID,
        },
    });
    
    console.log('✅ Smart Account to Target transaction submitted!');
    console.log('UserOperation Hash:', userOperationHash);
    console.log('Transaction will be sponsored by Alchemy Gas Manager');

    // Wait for the user operation to be included in a block
    console.log('Waiting for user operation confirmation...');
    const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOperationHash,
    });
    
    console.log('✅ UserOperation confirmed!');
    console.log('Transaction Hash:', receipt.receipt.transactionHash);
}
main();
