const dotenv = require('dotenv');
dotenv.config();
const {
    http,
    createPublicClient,
    createWalletClient,
    parseUnits,
    encodeFunctionData
} = require('viem');
const { monadTestnet } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const { Implementation, toMetaMaskSmartAccount } = require('@metamask/delegation-toolkit');
const { createBundlerClient, createPaymasterClient } = require('viem/account-abstraction');

// Define the ABI for the ERC20 transfer function
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
    }
];

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
    
    // Replace with the actual ERC20 token contract address
    const tokenContractAddress = "0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B";
    const targetAddress = "0x51AC36E05CAbD8F40525a314601B540a02bf20a8";
    
    // Use parseUnits to handle token decimals
    const tokenAmount = parseUnits("10", 18);
    
    // Encode the transfer function call using viem
    const callData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [targetAddress, tokenAmount],
    });
    
    console.log('=== Send ERC20 Tokens from Smart Account to Target ===');
    console.log('Smart Account Address:', smartAccount.address);
    console.log('Target Address:', targetAddress);
    console.log('Amount:', tokenAmount.toString(), ' (10 tokens)');
    console.log('Token Contract:', tokenContractAddress);

    const userOperationHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: [
            {
                to: tokenContractAddress,
                data: callData,
            }
        ],
        paymaster: paymasterClient,
        paymasterContext: {
            policyId: process.env.ALCHEMY_POLICY_ID,
        },
    });
    
    console.log('✅ Smart Account to Target transaction submitted!');
    console.log('UserOperation Hash:', userOperationHash);
    console.log('Transaction will be sponsored by Alchemy Gas Manager');

    console.log('Waiting for user operation confirmation...');
    const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOperationHash,
    });
    
    console.log('✅ UserOperation confirmed!');
    console.log('Transaction Hash:', receipt.receipt.transactionHash);
}
main();

