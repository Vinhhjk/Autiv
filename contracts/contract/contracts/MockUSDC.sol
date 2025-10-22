// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC is ERC20, ERC20Burnable, Ownable, ERC20Permit {
    constructor(address recipient, address initialOwner)
        ERC20("Mock USDC", "mUSDC")
        Ownable(initialOwner)
        ERC20Permit("Mock USDC")
    {
        _mint(recipient, 10000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
    // Add this function after the mint function
    function claim() public {
        _mint(msg.sender, 420 * 10 ** decimals()); // 420 tokens
    }

}
