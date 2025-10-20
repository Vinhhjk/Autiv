import dotenv from 'dotenv';
dotenv.config();
import {
    http,
    createPublicClient,
    createWalletClient,
    parseUnits
} from'viem';
import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit';
// Removed bundler and paymaster imports as we're using regular EOA transactions

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

    // No need for bundler and paymaster clients since we're using regular EOA transactions
    
    // Replace with the actual ERC20 token contract address
    const tokenContractAddress = "0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B";
    
    // Use parseUnits to handle token decimals
    const tokenAmount = parseUnits("10", 18);
    
    // No need to encode function data since we're using writeContract directly
    
    console.log('=== Send ERC20 Tokens from EOA to Smart Account ===');
    console.log('EOA Address:', owner);
    console.log('Smart Account Address:', smartAccount.address);
    console.log('Amount:', tokenAmount.toString(), ' (10 tokens)');
    console.log('Token Contract:', tokenContractAddress);

    // Send ERC20 tokens from EOA to smart account using regular transaction
    const hash = await walletClient.writeContract({
        address: tokenContractAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [smartAccount.address, tokenAmount],
    });
    
    console.log('✅ EOA to Smart Account transaction submitted!');
    console.log('Transaction Hash:', hash);

    console.log('Waiting for transaction confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({
        hash: hash,
    });
    
    console.log('✅ Transaction confirmed!');
    console.log('Block Number:', receipt.blockNumber);
    console.log('Gas Used:', receipt.gasUsed.toString());
}
main();

