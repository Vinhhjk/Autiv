import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from contracts folder (two levels up)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Monad testnet configuration
const MONAD_TESTNET = {
  chainId: 10143,
  name: "Monad Testnet",
  rpcUrl: "https://testnet-rpc.monad.xyz",
  explorerUrl: "https://testnet-explorer.monad.xyz"
};

async function main() {
  console.log("Deploying Autiv contracts to Monad Testnet...");

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(MONAD_TESTNET.rpcUrl);
  
  // Use private key from environment
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not found in environment variables');
  }
  
  // Add 0x prefix if not present
  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }
  
  if (privateKey.length !== 66) {
    throw new Error('DEPLOYER_PRIVATE_KEY must be a valid 64-character hex string (with or without 0x prefix)');
  }
  
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log("Deploying with account:", wallet.address);

  // Get contract bytecode and ABI from artifacts
  const subscriptionManagerArtifact = JSON.parse(
    fs.readFileSync("artifacts/contract/contracts/SubscriptionManager.sol/SubscriptionManager.json", "utf8")
  );

  // Deploy SubscriptionManager
  console.log("\nDeploying SubscriptionManager...");
  const SubscriptionManagerFactory = new ethers.ContractFactory(
    subscriptionManagerArtifact.abi,
    subscriptionManagerArtifact.bytecode,
    wallet
  );
  
  const subscriptionManager = await SubscriptionManagerFactory.deploy();
  await subscriptionManager.waitForDeployment();
  
  const subscriptionManagerAddress = await subscriptionManager.getAddress();
  console.log("SubscriptionManager deployed at:", subscriptionManagerAddress);

  console.log("\nContract addresses:");
  console.log(`   SubscriptionManager: ${subscriptionManagerAddress}`);

  // Create test subscription plans using batch function
  console.log("\nCreating test subscription plans (1, 2, 5 minutes) in batch...");
  const usdcAddress = "0x7B35FBfa0635dbF7c4ACFA733585b90e3531888A";
  
  // Check USDC decimals dynamically
  console.log("Checking USDC token decimals...");
  const usdcAbi = [
    "function decimals() view returns (uint8)"
  ];
  
  const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);
  const usdcDecimals = await usdcContract.decimals();
  
  console.log(`USDC has ${usdcDecimals} decimals`);
  
  // Calculate prices with correct decimals
  const usdcMultiplier = BigInt(10 ** Number(usdcDecimals));
  const price1USDC = 1n * usdcMultiplier; // 1 USDC
  const price2USDC = 2n * usdcMultiplier; // 2 USDC  
  const price5USDC = 5n * usdcMultiplier; // 5 USDC
  
  console.log(`Calculated prices: ${price1USDC}, ${price2USDC}, ${price5USDC}`);
  
  // Create contract instance with proper typing for function calls
  const subscriptionManagerContract = new ethers.Contract(
    subscriptionManagerAddress,
    subscriptionManagerArtifact.abi,
    wallet
  );
  
  // Create all 3 test plans in a single transaction
  console.log("\nCreating subscription plans...");
  const tx = await subscriptionManagerContract.createPlansBatch(
    ["1 Minute Test", "2 Minutes Test", "5 Minutes Test"], // Names
    [price1USDC, price2USDC, price5USDC], // Prices with correct decimals
    [60, 120, 300], // Periods (60, 120, 300 seconds)
    [usdcAddress, usdcAddress, usdcAddress] // Token addresses
  );
  
  console.log("Transaction sent:", tx.hash);
  await tx.wait();
  console.log("All 3 test plans created in single transaction!");

  // Save addresses
  const addresses = {
    SUBSCRIPTION_MANAGER: subscriptionManagerAddress,
    USDC_ADDRESS: usdcAddress,
    DEPLOYMENT_TIMESTAMP: Math.floor(Date.now() / 1000),
    NETWORK: "monad-testnet",
    CHAIN_ID: 10143,
    RPC_URL: "https://testnet-rpc.monad.xyz",
    EXPLORER_URL: "https://testnet.monadexplorer.xyx"
  };

  fs.writeFileSync('deployment-addresses.json', JSON.stringify(addresses, null, 2));
  console.log("\nContract addresses saved to deployment-addresses.json");
  console.log("\nDeployment successful!");
  console.log(`\nView on Explorer: ${MONAD_TESTNET.explorerUrl}/address/${subscriptionManagerAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
