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
  explorerUrl: "https://testnet.monadexplorer.com"
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
  const mockUsdcArtifact = JSON.parse(
    fs.readFileSync("artifacts/contract/contracts/MockUSDC.sol/MockUSDC.json", "utf8")
  );

  const subscriptionManagerArtifact = JSON.parse(
    fs.readFileSync("artifacts/contract/contracts/SubscriptionManager.sol/SubscriptionManager.json", "utf8")
  );

  const subscriptionManagerFactoryArtifact = JSON.parse(
    fs.readFileSync("artifacts/contract/contracts/SubscriptionManagerFactory.sol/SubscriptionManagerFactory.json", "utf8")
  );

  // Use predefined USDC-compatible token address
  const mockUsdcAddress = "0x145Ee5ed9BDd2C58EC03adADDCCd8C0253db60F3";
  console.log("\nUsing predefined USDC token at:", mockUsdcAddress);

  // Deploy SubscriptionManagerFactory
  console.log("\nDeploying SubscriptionManagerFactory...");
  const SubscriptionManagerFactoryFactory = new ethers.ContractFactory(
    subscriptionManagerFactoryArtifact.abi,
    subscriptionManagerFactoryArtifact.bytecode,
    wallet
  );

  const subscriptionManagerFactory = await SubscriptionManagerFactoryFactory.deploy();
  await subscriptionManagerFactory.waitForDeployment();
  const subscriptionManagerFactoryAddress = await subscriptionManagerFactory.getAddress();

  console.log("SubscriptionManagerFactory deployed at:", subscriptionManagerFactoryAddress);

  console.log("\nPreparing subscription manager deployment through factory...");

  // Check token decimals dynamically
  const mockUsdcContract = new ethers.Contract(
    mockUsdcAddress,
    mockUsdcArtifact.abi,
    wallet
  );
  const usdcDecimals: number = await mockUsdcContract.decimals();
  console.log(`MockUSDC has ${usdcDecimals} decimals`);

  // Calculate prices with correct decimals
  const usdcMultiplier = BigInt(10 ** Number(usdcDecimals));
  const price1USDC = 1n * usdcMultiplier; // 1 USDC
  const price2USDC = 2n * usdcMultiplier; // 2 USDC  
  const price5USDC = 5n * usdcMultiplier; // 5 USDC
  
  console.log(`Calculated prices: ${price1USDC}, ${price2USDC}, ${price5USDC}`);
  const planNames = ["1 Minute Test", "2 Minutes Test", "5 Minutes Test"];
  const planPrices = [price1USDC, price2USDC, price5USDC];
  const planPeriods = [60, 120, 300];
  const planTokenAddresses = [mockUsdcAddress, mockUsdcAddress, mockUsdcAddress];

  // Create subscription manager via factory
  const subscriptionManagerFactoryContract = new ethers.Contract(
    subscriptionManagerFactoryAddress,
    subscriptionManagerFactoryArtifact.abi,
    wallet
  );

  console.log("\nDeploying SubscriptionManager through factory with seeded plans...");
  const createTx = await subscriptionManagerFactoryContract.createSubscriptionManager(
    wallet.address,
    planNames,
    planPrices,
    planPeriods,
    planTokenAddresses
  );

  console.log("Transaction sent:", createTx.hash);
  const receipt = await createTx.wait();

  let subscriptionManagerAddress: string | undefined;
  for (const log of receipt.logs) {
    try {
      const parsed = subscriptionManagerFactoryContract.interface.parseLog(log);
      if (parsed && parsed.name === "SubscriptionManagerDeployed") {
        subscriptionManagerAddress = parsed.args.subscriptionManager;
        break;
      }
    } catch (error) {
      // Ignore logs from other contracts
    }
  }

  if (!subscriptionManagerAddress) {
    const managers = await subscriptionManagerFactoryContract.getManagersByOwner(wallet.address);
    if (managers.length === 0) {
      throw new Error("Factory did not return any subscription manager addresses");
    }
    subscriptionManagerAddress = managers[managers.length - 1];
  }

  console.log("SubscriptionManager deployed via factory at:", subscriptionManagerAddress);

  console.log("\nContract addresses:");
  console.log(`   MockUSDC: ${mockUsdcAddress}`);
  console.log(`   SubscriptionManagerFactory: ${subscriptionManagerFactoryAddress}`);
  console.log(`   SubscriptionManager: ${subscriptionManagerAddress}`);

  // Save addresses
  const addresses = {
    MOCK_USDC: mockUsdcAddress,
    SUBSCRIPTION_MANAGER_FACTORY: subscriptionManagerFactoryAddress,
    SUBSCRIPTION_MANAGER: subscriptionManagerAddress,
    DEPLOYMENT_TIMESTAMP: Math.floor(Date.now() / 1000),
    NETWORK: "monad-testnet",
    CHAIN_ID: 10143,
    RPC_URL: "https://testnet-rpc.monad.xyz",
    EXPLORER_URL: MONAD_TESTNET.explorerUrl
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
