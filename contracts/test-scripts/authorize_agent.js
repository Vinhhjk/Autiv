import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };

const SubscriptionManagerABI = SubscriptionManager.abi;
const RPC_URL = 'https://testnet-rpc.monad.xyz';

async function authorizeAgent() {
    // Setup provider + wallet (deployer/owner)
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const deployer = new ethers.Wallet(process.env.DEPLOYER_EOA_PRIVATE_KEY, provider);
    const agent = new ethers.Wallet(process.env.EOA_PRIVATE_KEY, provider);

    console.log('Deployer Address:', deployer.address);
    console.log('Agent Address:', agent.address);

    // Setup contract with deployer (owner)
    const SubscriptionManagerAddress = "0xae5f5c40a6b685f5a87e4fbd4e3f63588571a29c";
    const SubscriptionManagerContract = new ethers.Contract(
        SubscriptionManagerAddress,
        SubscriptionManagerABI,
        deployer
    );

    // Authorize the agent
    console.log('\nAuthorizing agent to process payments...');
    const tx = await SubscriptionManagerContract.authorizeExecutor(agent.address, true);
    console.log('Tx sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Tx confirmed in block:', receipt.blockNumber);
    
    // Verify authorization
    const isAuthorized = await SubscriptionManagerContract.authorizedExecutors(agent.address);
    console.log('\nAgent authorized:', isAuthorized);
}

authorizeAgent().catch(console.error);
