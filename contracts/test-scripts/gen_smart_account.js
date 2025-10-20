import dotenv from 'dotenv';
dotenv.config();

import { http, createPublicClient, createWalletClient } from 'viem';
import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit';

// Load your EOA private key
const account = privateKeyToAccount(process.env.DEPLOYER_EOA_PRIVATE_KEY);

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
  // Get the EOA address
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

  console.log("Smart Account created!");
  console.log("Owner EOA:", owner);
  console.log("Smart Account Address:", smartAccount.address);
}

main().catch(console.error);
