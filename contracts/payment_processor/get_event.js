import { ethers } from "ethers";
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };
import deploymentAdress from '../deployment-addresses.json' with { type: 'json' };

// Setup env and provider
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const HYPERSYNC_RPC_URL = `https://monad-testnet.rpc.hypersync.xyz/${process.env.HYPERSYNC_API}`;

async function main() {
  const provider = new ethers.JsonRpcProvider(HYPERSYNC_RPC_URL);
  const SubscriptionManagerContract = new ethers.Contract(
    deploymentAdress.SUBSCRIPTION_MANAGER,
    SubscriptionManager.abi,
    provider
  );

  const txHash = "0xfcac16b1248be68bfc768e806e0d69c18380e2a932b65c25fc4820d00b830fe6";
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt) {
    console.log("Transaction not found or still pending");
    return;
  }

  console.log("\n📊 Transaction Receipt Info:");
  console.log("   Status:", receipt.status === 1 ? "✅ Success" : "❌ Failed");
  console.log("   Total logs:", receipt.logs.length);
  console.log("   From:", receipt.from);
  console.log("   To:", receipt.to);
  console.log("\n🔍 Expected SubscriptionManager:", deploymentAdress.SUBSCRIPTION_MANAGER);
  
  console.log("\n📝 All log addresses in transaction:");
  receipt.logs.forEach((log, i) => {
    console.log(`   Log ${i}: ${log.address}`);
  });

  // Interface to parse logs
  const iface = new ethers.Interface(SubscriptionManager.abi);

  // Filter logs emitted by your contract
  const contractLogs = receipt.logs.filter(
    log => log.address.toLowerCase() === deploymentAdress.SUBSCRIPTION_MANAGER.toLowerCase()
  );

  let foundEvent = false;

  console.log(`\n📋 Found ${contractLogs.length} logs from SubscriptionManager contract\n`);

  for (const log of contractLogs) {
    try {
      const parsedLog = iface.parseLog(log);
      console.log(" Event detected:", parsedLog.name);
      console.log("   Args:", parsedLog.args);
      
      // Check for SubscriptionCreated event
      if (parsedLog.name === "SubscriptionCreated") {
        foundEvent = true;
        console.log("\n SubscriptionCreated event found!");
        console.log("   User Address:", parsedLog.args[0]);
        console.log("   Plan ID:", parsedLog.args[1].toString());
      }
      
      // Check for PaymentProcessed event
      if (parsedLog.name === "PaymentProcessed") {
        foundEvent = true;
        console.log("\n PaymentProcessed event found!");
      }
      
      console.log(""); // Empty line for readability
    } catch (err) {
      // ignore logs that don't match ABI
    }
  }

  if (!foundEvent) {
    console.log(" No SubscriptionCreated or PaymentProcessed event found in this transaction.");
  }
}

main().catch((err) => console.error("Error:", err));
