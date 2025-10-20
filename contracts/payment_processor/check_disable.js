import {
  getDelegationHashOffchain,
} from '@metamask/delegation-toolkit/utils';
import { createPublicClient, http } from 'viem';
import { monadTestnet } from 'viem/chains';
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit'

async function checkDisable() {
    const publicClient = createPublicClient({
        chain: monadTestnet,
        transport: http()
    });
    const environment = getDeleGatorEnvironment(monadTestnet.id);
    if (!environment) {
        throw new Error('Delegation environment not found for Monad Testnet');
    }
    const delegation =  {
    "delegate": "0x2cDdE59123226e7321180153bBDB21CCF848c301",
    "delegator": "0xc268bb650282233B625FBF5ab3c5ecB8c63b1f1f",
    "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "caveats": [
      {
        "enforcer": "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
        "terms": "0x2cDdE59123226e7321180153bBDB21CCF848c301",
        "args": "0x"
      },
      {
        "enforcer": "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
        "terms": "0x8fe123d7",
        "args": "0x"
      }
    ],
    "salt": "0x68f500fb",
    "signature": "0x0c36df9ef16b76abff04814fff0b205cc26a35818ddcf9cd6588256e99c77aef443b0d60f4013400b692c571aab8a2508afb714aaf9402560f26b39c572b0b0f1b"
  }
    
    const delegationHash = getDelegationHashOffchain(delegation);
    console.log('Delegation Hash:', delegationHash);
    const isDisabled = await DelegationManager.read.disabledDelegations({
        client: publicClient,
        contractAddress: environment.DelegationManager,
        delegationHash,
    });
    console.log('Is Delegation Disabled:', isDisabled);
}

checkDisable().catch(console.error);