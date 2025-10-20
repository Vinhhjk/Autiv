import {ethers} from "ethers";
import SubscriptionManager from '../SubscriptionManager.json' with { type: 'json' };
const rpcUrl ='https://testnet-rpc.monad.xyz';
async function getSub() {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const targetAddress = '0xc268bb650282233B625FBF5ab3c5ecB8c63b1f1f'
    const SubscriptionManagerAddress = "0xc0f7E3f8211EAd60964CA9c491F6C9789f3901d4";

    const subscriptionManager = new ethers.Contract(
        SubscriptionManagerAddress,
        SubscriptionManager.abi,
        provider
    );
    const available_plans = await subscriptionManager.getPlanCount();
    console.log(available_plans);
    const subscription = await subscriptionManager.getUserSubscription(targetAddress);
    console.log(subscription);
}
getSub()