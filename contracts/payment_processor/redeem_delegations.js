import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { createExecution, ExecutionMode } from '@metamask/delegation-toolkit';
async function main() {
    const approveDelegation={
    "delegate": "0x2cDdE59123226e7321180153bBDB21CCF848c301",
    "delegator": "0xc268bb650282233B625FBF5ab3c5ecB8c63b1f1f",
    "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "caveats": [
      {
        "enforcer": "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
        "terms": "0x7B35FBfa0635dbF7c4ACFA733585b90e3531888A",
        "args": "0x"
      },
      {
        "enforcer": "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
        "terms": "0x095ea7b3",
        "args": "0x"
      }
    ],
    "salt": "0x68f500fa",
    "signature": "0x280ba77bfe6accd9730174769380e8e5cc9301c0eb187f11c5b3044b49bdb6f96559d30701c0e15ae257c520568b033edab0b3be20b790817c37a8300b19833c1c"
  }
    const processPaymentDelegation={
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
    const wallet = new ethers.Wallet(process.env.EOA_PRIVATE_KEY);
    agent = wallet.connect(monadProvider);
      const erc20Abi = [
          {
              inputs: [
                  { internalType: 'address', name: 'spender', type: 'address' },
                  { internalType: 'uint256', name: 'amount', type: 'uint256' },
              ],
              name: 'approve',
              outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
              stateMutability: 'nonpayable',
              type: 'function',
          },
      ];

      // Create token contract instance
      const tokenContract = new ethers.Contract(planTokenAddress, erc20Abi, agent);
      const approveCalldata = tokenContract.interface.encodeFunctionData(
          'approve',
          [SubscriptionManagerAddress, planDetails.price]
      )

      const approveExecution = createExecution({
          target: tokenAddress,
          value: 0n,
          callData: approveCalldata,
      });
      const processPaymentCalldata = SubscriptionManagerContract.interface.encodeFunctionData(
          'processPayment',
          [target_address]
      );
}
main()
