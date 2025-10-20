import { config } from 'dotenv'
config({ path: new URL('../.env', import.meta.url).pathname })
import { http, createPublicClient, createWalletClient, parseUnits, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createBundlerClient } from 'viem/account-abstraction'
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit'

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`] } },
  testnet: true,
}

const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' // v0.7
const USDC = process.env.USDC ?? '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B'
const SUBSCRIPTION_MANAGER = process.env.SUB_MGR ?? '0xae5f5c40a6b685f5a87e4fbd4e3f63588571a29c'

const ENTRYPOINT_ABI = [
  { name: 'depositTo', type: 'function', stateMutability: 'payable', inputs: [{ name: 'account', type: 'address' }], outputs: [] },
  { name: 'getDepositInfo', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'deposit', type: 'uint112' }, { name: 'staked', type: 'bool' }, { name: 'stake', type: 'uint112' },
      { name: 'unstakeDelaySec', type: 'uint32' }, { name: 'withdrawTime', type: 'uint48' },
    ]},
]

const ERC20_ABI = [
  {
    constant: false,
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

async function main() {
  const ALCHEMY_KEY = process.env.ALCHEMY_KEY || process.env.VITE_ALCHEMY_API_KEY
  const POLICY_ID = process.env.POLICY_ID || process.env.VITE_ALCHEMY_GAS_POLICY_ID
  const PRIVATE_KEY = (process.env.PRIVATE_KEY?.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY || ''}`)

  const account = privateKeyToAccount(PRIVATE_KEY)
  const publicClient = createPublicClient({ chain: MONAD_TESTNET, transport: http() })
  const walletClient = createWalletClient({ account, chain: MONAD_TESTNET, transport: http() })

  console.log('Creating MetaMask Smart Account…')
  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [account.address, [], [], []],
    deploySalt: '0x',
    signer: { account },
  })
  console.log('Smart Account:', smartAccount.address)

  // Check EntryPoint deposit
  const dep = await publicClient.readContract({
    address: ENTRY_POINT,
    abi: ENTRYPOINT_ABI,
    functionName: 'getDepositInfo',
    args: [smartAccount.address],
  })
  // viem may return array-like + named props; support both
  const currentDeposit = (dep && (dep.deposit ?? dep[0])) ? BigInt(dep.deposit ?? dep[0]) : 0n
  console.log('Deposit info:', dep)
  console.log('EntryPoint deposit for SA (wei):', currentDeposit.toString())

  // Optional auto-top-up when flag provided
  if (process.argv.includes('--autodeposit')) {
    const targetMin = parseUnits('0.1', 18) // 0.1 MON target
    if (currentDeposit < targetMin) {
      const needed = targetMin - currentDeposit
      const balance = await publicClient.getBalance({ address: account.address })
      const gasReserve = parseUnits('0.005', 18) // keep some MON for gas
      const maxSendable = balance > gasReserve ? (balance - gasReserve) : 0n
      if (maxSendable <= 0n) {
        console.error(`EOA ${account.address} has insufficient MON. Balance: ${Number(balance)/1e18} MON. Top up from faucet, then retry.`)
        process.exit(1)
      }
      const depositValue = needed <= maxSendable ? needed : maxSendable
      console.log(`Auto-depositing ${(Number(depositValue) / 1e18).toFixed(6)} MON to EntryPoint for SA…`)
      const gasPrice = await publicClient.getGasPrice()
      await walletClient.writeContract({
        address: ENTRY_POINT,
        abi: ENTRYPOINT_ABI,
        functionName: 'depositTo',
        args: [smartAccount.address],
        value: depositValue,
        gas: 120000n,
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice / 10n,
      })
      const dep3 = await publicClient.readContract({
        address: ENTRY_POINT,
        abi: ENTRYPOINT_ABI,
        functionName: 'getDepositInfo',
        args: [smartAccount.address],
      })
      const newDeposit = (dep3 && (dep3.deposit ?? dep3[0])) ? BigInt(dep3.deposit ?? dep3[0]) : 0n
      console.log('New EntryPoint deposit (wei):', newDeposit.toString())
    } else {
      console.log('Deposit already >= target, skipping auto-top-up.')
    }
  }

  if (process.argv.includes('--deposit')) {
    const amt = process.argv.includes('--amt')
      ? process.argv[process.argv.indexOf('--amt') + 1]
      : '0.2'
    console.log(`Depositing ${amt} MON into EntryPoint for SA…`)
    await walletClient.writeContract({
      address: ENTRY_POINT,
      abi: ENTRYPOINT_ABI,
      functionName: 'depositTo',
      args: [smartAccount.address],
      value: parseUnits(amt, 18),
    })
    const dep2 = await publicClient.readContract({
      address: ENTRY_POINT,
      abi: ENTRYPOINT_ABI,
      functionName: 'getDepositInfo',
      args: [smartAccount.address],
    })
    console.log('New deposit:', dep2.deposit?.toString?.())
  }

  const bundler = createBundlerClient({
    chain: MONAD_TESTNET,
    transport: http(`https://monad-testnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
  })

  // Build a real call (USDC approve 1 USDC to SUBSCRIPTION_MANAGER)
  const amount = parseUnits('1', 18)

  console.log('Preparing UO with optional sponsorship…')
  const uoHash = await bundler.sendUserOperation({
    account: smartAccount,
    calls: [{
      to: USDC,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SUBSCRIPTION_MANAGER, amount],
      }),
    }],
    // Ask Alchemy Gas Manager for sponsorship and print what it returns
    sponsorUserOperation: async ({ userOperation, entryPoint }) => {
      if (!POLICY_ID) {
        console.warn('No POLICY_ID set; will likely be unsponsored.')
      }
      const dummySig = typeof smartAccount.getStubSignature === 'function'
        ? await smartAccount.getStubSignature() : undefined

      const res = await bundler.request({
        method: 'alchemy_requestGasAndPaymasterAndData',
        params: [{
          policyId: POLICY_ID,
          entryPoint,
          userOperation,
          dummySignature: dummySig,
        }],
      })
      console.log('Gas Manager response:', res) // look for non-empty paymasterAndData
      const toBigInt = v => (typeof v === 'string' && v.startsWith('0x') ? BigInt(v) : undefined)
      return {
        paymasterAndData: res?.paymasterAndData,
        preVerificationGas: toBigInt(res?.preVerificationGas),
        verificationGasLimit: toBigInt(res?.verificationGasLimit),
        callGasLimit: toBigInt(res?.callGasLimit),
        maxFeePerGas: toBigInt(res?.maxFeePerGas),
        maxPriorityFeePerGas: toBigInt(res?.maxPriorityFeePerGas),
      }
    },
  })

  console.log('UO sent. Hash:', uoHash)
  const receipt = await bundler.waitForUserOperationReceipt({ hash: uoHash })
  console.log('UO mined. Tx:', receipt?.receipt?.transactionHash)
}

main().catch((e) => { console.error(e); process.exit(1) })