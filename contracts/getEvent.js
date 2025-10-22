import { ethers } from "ethers";
import dotenv from "dotenv";
import SubscriptionManagerABI from './artifacts/contract/contracts/SubscriptionManager.sol/SubscriptionManager.json' with { type: "json" };
import SubscriptionManagerFactoryABI from './artifacts/contract/contracts/SubscriptionManagerFactory.sol/SubscriptionManagerFactory.json' with { type: "json" };

dotenv.config();

async function main() {
  const provider = new ethers.JsonRpcProvider(`https://monad-testnet.rpc.hypersync.xyz/${process.env.HYPERSYNC_API}`);

  const SubscriptionManagerAddress = '0xb5CBa9F9B39c8DeE9AE6863a091b69f043D74934';
  const SubscriptionManagerFactoryAddress = '0xDCaA50F9995C6C37D52e8699Ea0BCB5fd10eC43d';
  const txHash = '0x4cc0d1630752d53a24b2245472cdfad6477b3f857876fd9e70290a6e48a21477';

  // Decode logs
  const txReceipt = await provider.getTransactionReceipt(txHash);
  console.log('\nTx Receipt Status:', txReceipt.status);

  const interfaces = [
    { name: "SubscriptionManager", address: SubscriptionManagerAddress.toLowerCase(), iface: new ethers.Interface(SubscriptionManagerABI.abi) },
    { name: "SubscriptionManagerFactory", address: SubscriptionManagerFactoryAddress.toLowerCase(), iface: new ethers.Interface(SubscriptionManagerFactoryABI.abi) },
  ];

  console.log("\n=== Decoded Events ===");

  for (const log of txReceipt.logs) {
    const logAddress = log.address.toLowerCase();
    const matched = interfaces.find(i => i.address === logAddress);

    if (!matched) continue;

    try {
      const parsed = matched.iface.parseLog(log);
      console.log(`Contract: ${matched.name}`);
      console.log(`Event: ${parsed.name}`);
      console.log(parsed.args);
      console.log("---------------------------");
    } catch (err) {
      // ABI didn't match
    }
  }
}

main();
