import { monadTestnet } from 'viem/chains'
import { createPublicClient, http } from 'viem'
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit'
import { DelegationManager } from "@metamask/delegation-toolkit/contracts"

async function checkDelegationState() {
    console.log('🔍 Checking Delegation State...');
    
    const environment = getDeleGatorEnvironment(monadTestnet.id)
    if (!environment) {
        throw new Error('Delegation environment not found for Monad Testnet');
    }

    const publicClient = createPublicClient({
        chain: monadTestnet,
        transport: http(),
    })

    const delegation = {
        "delegate": "0x406b16A36926814305dF25757c93d298b639Bef0",
        "delegator": "0x9D54F12eb708645a99C0356387BC76846C3CA802",
        "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",       
        "caveats": [
          {
            "enforcer": "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
            "terms": "0xd8840e4A14fDd6833F213919ebF5727ee9E2E4dB",
            "args": "0x"
          },
          {
            "enforcer": "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
            "terms": "0x8fe123d7",
            "args": "0x"
          }
        ],
        "salt": "1760119000588",
        "signature": "0x1d4eaa3929bfd96a0a9bb579737794bc430301a95201960ca75bd9d2212740de2a55642829265984cdb41d39b8f3d0fa18fbd55a7d3fc57c9dcea13f83f64a1e1c"
      }
      

    try {
        console.log('Delegation Details:');
        console.log('- Delegate:', delegation.delegate);
        console.log('- Delegator:', delegation.delegator);
        console.log('- Salt:', delegation.salt);

        // Try to use the delegation by encoding a test call
        // If it fails, the delegation is likely disabled
        console.log('\n🧪 Testing Delegation Usability...');
        
        let isValid = false;
        try {
            // Try to encode a redeemDelegations call to test if delegation works
            const testCalldata = DelegationManager.encode.redeemDelegations({
                delegations: [[delegation]],
                modes: [0], // SingleDefault mode
                executions: [[{
                    target: "0x0000000000000000000000000000000000000000",
                    value: 0n,
                    callData: "0x"
                }]],
            });
            
            // If we can encode it, the delegation structure is valid
            // We can't easily test execution without actually sending a transaction
            console.log('- Delegation structure is valid for encoding');
            isValid = true;
            
        } catch (error) {
            console.log('- Delegation encoding failed:', error.message);
            isValid = false;
        }

        console.log('\n📊 Delegation Status:');
        console.log('- Structure Valid:', isValid);
        
        if (isValid) {
            console.log('✅ Delegation structure is VALID - Can be encoded for transactions');
            console.log('⚠️  Note: This only tests structure, not on-chain disabled status');
        } else {
            console.log('❌ Delegation structure is INVALID - Cannot be used');
        }

        // Show caveat information
        console.log('\nCaveat Details:');
        for (let i = 0; i < delegation.caveats.length; i++) {
            const caveat = delegation.caveats[i];
            console.log(`Caveat ${i + 1}:`);
            console.log(`Enforcer: ${caveat.enforcer}`);
            console.log(`Terms: ${caveat.terms}`);
            
            // Decode terms based on enforcer type
            if (caveat.enforcer === "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB") {
                console.log(`Type: AllowedTargetsEnforcer (Contract: ${caveat.terms})`);
            } else if (caveat.enforcer === "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5") {
                console.log(`Type: AllowedMethodsEnforcer (Function: ${caveat.terms})`);
            }
        }

        return {
            isValid,
            delegation,
        };

    } catch (error) {
        console.error('Error checking delegation state:', error.message);
        throw error;
    }
}

checkDelegationState().catch(console.error);
