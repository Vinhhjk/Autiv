import {ethers} from 'ethers';

const erc20Abi = [
    {
      "inputs": [
        { "internalType": "address", "name": "spender", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "approve",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "transfer",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "owner", "type": "address" },
        { "internalType": "address", "name": "spender", "type": "address" }
      ],
      "name": "allowance",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    }
  ];
const target_address = '0x9D54F12eb708645a99C0356387BC76846C3CA802'
const target_token = '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B'

async function checkApproval() {
    const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
    const tokenContract = new ethers.Contract(target_token, erc20Abi, provider);
    const allowance = await tokenContract.allowance(target_address, '0x92Bf12322527cAA612fd31a0e810472BBB106A8F');
    console.log('Allowance:', ethers.formatEther(allowance));
}

checkApproval();
