import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the contracts/.env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONAD_TESTNET = {
  chainId: 10143,
  name: "Monad Testnet",
  rpcUrl: "https://testnet-rpc.monad.xyz",
};

async function main() {
  console.log("Deploying standalone MockUSDC token to Monad Testnet...");

  const provider = new ethers.JsonRpcProvider(MONAD_TESTNET.rpcUrl);

  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY not found in environment variables");
  }
  if (!privateKey.startsWith("0x")) {
    privateKey = `0x${privateKey}`;
  }
  if (privateKey.length !== 66) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a valid 64-character hex string");
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Deploying with account:", wallet.address);

  const mockUsdcArtifactPath = "artifacts/contract/contracts/MockUSDC.sol/MockUSDC.json";
  if (!fs.existsSync(mockUsdcArtifactPath)) {
    throw new Error("MockUSDC artifact not found. Run `npm run compile` first.");
  }

  const mockUsdcArtifact = JSON.parse(fs.readFileSync(mockUsdcArtifactPath, "utf8"));

  const MockUSDCFactory = new ethers.ContractFactory(
    mockUsdcArtifact.abi,
    mockUsdcArtifact.bytecode,
    wallet
  );

  console.log("Deploying MockUSDC...");
  const mockUSDC = await MockUSDCFactory.deploy(wallet.address, wallet.address);
  const receipt = await mockUSDC.waitForDeployment();

  const deployedAddress = await mockUSDC.getAddress();
  console.log("MockUSDC deployed at:", deployedAddress);
  console.log("Transaction hash:", receipt.deploymentTransaction()?.hash ?? "n/a");

  console.log("\nToken deployment complete. Store the address for future allow-list configuration.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
