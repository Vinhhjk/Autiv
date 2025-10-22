// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SubscriptionManager.sol";

/**
 * @title SubscriptionManagerFactory
 * @dev Deploys new SubscriptionManager contracts and tracks ownership mappings.
 */
contract SubscriptionManagerFactory is Ownable {
    /// @notice Emitted whenever a new SubscriptionManager is deployed through the factory
    event SubscriptionManagerDeployed(
        address indexed creator,
        address indexed owner,
        address subscriptionManager
    );

    /// @notice Emitted when a token address is added to the allow list
    event AllowedTokenAdded(address indexed token);

    /// @notice Emitted when a token address is removed from the allow list
    event AllowedTokenRemoved(address indexed token);

    // List of all deployed manager addresses
    address[] private _allManagers;
    // Track managers owned by a particular address
    mapping(address => address[]) private _managersByOwner;

    // Mapping of tokens that are permitted for plan creation
    mapping(address => bool) private _allowedTokens;

    constructor() Ownable(msg.sender) {
        _setupInitialAllowedTokens();
    }

    function _setupInitialAllowedTokens() internal {
        _allowedTokens[0x145Ee5ed9BDd2C58EC03adADDCCd8C0253db60F3] = true;
        _allowedTokens[0xf817257fed379853cDe0fa4F97AB987181B1E5Ea] = true;
        _allowedTokens[0xdA054a96254776346386060C480B42A10C870Cd2] = true;
        _allowedTokens[0x11517333d9a65ca3331c3c60bB288fa98013a2Ed] = true;

        emit AllowedTokenAdded(0x145Ee5ed9BDd2C58EC03adADDCCd8C0253db60F3);
        emit AllowedTokenAdded(0xf817257fed379853cDe0fa4F97AB987181B1E5Ea);
        emit AllowedTokenAdded(0xdA054a96254776346386060C480B42A10C870Cd2);
        emit AllowedTokenAdded(0x11517333d9a65ca3331c3c60bB288fa98013a2Ed);
    }

    /**
     * @notice Adds a token address to the allow list.
     * @dev Only callable by the contract owner.
     * @param token The ERC20 token address to add.
     */
    function addAllowedToken(address token) external onlyOwner {
        require(token != address(0), "Factory: zero token");
        require(!_allowedTokens[token], "Factory: token already allowed");
        _allowedTokens[token] = true;
        emit AllowedTokenAdded(token);
    }

    /**
     * @notice Removes a token address from the allow list.
     * @dev Only callable by the contract owner.
     * @param token The ERC20 token address to remove.
     */
    function removeAllowedToken(address token) external onlyOwner {
        require(_allowedTokens[token], "Factory: token not allowed");
        delete _allowedTokens[token];
        emit AllowedTokenRemoved(token);
    }

    /**
     * @notice Checks whether a token is currently allowed.
     * @param token The token address to query.
     */
    function isTokenAllowed(address token) public view returns (bool) {
        return _allowedTokens[token];
    }

    /**
     * @notice Deploy a new SubscriptionManager instance.
     * @param owner Address that should become the owner of the newly deployed manager.
     *              If zero address is supplied, ownership defaults to the transaction sender.
     * @return manager Address of the deployed SubscriptionManager contract.
     */
    function createSubscriptionManager(
        address owner,
        string[] calldata planNames,
        uint256[] calldata planPrices,
        uint256[] calldata planPeriods,
        address[] calldata planTokenAddresses
    ) external returns (address manager) {
        address resolvedOwner = owner == address(0) ? msg.sender : owner;

        require(
            planNames.length == planPrices.length &&
                planNames.length == planPeriods.length &&
                planNames.length == planTokenAddresses.length,
            "Factory: plan array length mismatch"
        );

        SubscriptionManager newManager = new SubscriptionManager();
        manager = address(newManager);

        require(planNames.length > 0, "Factory: at least one plan required");

        uint256 maxPlans = newManager.MAX_PLANS();
        require(planNames.length <= maxPlans, "Factory: exceeds max plans");

        for (uint256 i = 0; i < planTokenAddresses.length; i++) {
            require(isTokenAllowed(planTokenAddresses[i]), "Factory: token not allowed");
        }

        newManager.createPlansBatch(planNames, planPrices, planPeriods, planTokenAddresses);

        // Transfer ownership to the resolved owner (factory is the deployer by default)
        newManager.transferOwnership(resolvedOwner);

        _allManagers.push(manager);
        _managersByOwner[resolvedOwner].push(manager);

        emit SubscriptionManagerDeployed(msg.sender, resolvedOwner, manager);
    }

    /**
     * @notice Returns all SubscriptionManager addresses created by this factory.
     */
    function getAllManagers() external view returns (address[] memory) {
        return _allManagers;
    }

    /**
     * @notice Returns all SubscriptionManager addresses owned by a specific account.
     * @param owner Address to query.
     */
    function getManagersByOwner(address owner) external view returns (address[] memory) {
        return _managersByOwner[owner];
    }

    /**
     * @notice Returns the total number of SubscriptionManager instances deployed by the factory.
     */
    function totalManagers() external view returns (uint256) {
        return _allManagers.length;
    }
}
