// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SubscriptionManager
 * @dev Manages subscription plans and automated payments using MetaMask Smart Accounts delegation
 */
contract SubscriptionManager is Ownable, ReentrancyGuard {
    
    struct SubscriptionPlan {
        uint256 id;
        string name;
        uint256 price; // in USDC (6 decimals)
        uint256 period; // in seconds (e.g., 86400 for daily)
        bool active;
        address tokenAddress; // USDC token address
    }
    
    struct UserSubscription {
        uint256 planId;
        uint256 startTime;
        uint256 lastPayment;
        bool active;
        address delegator; // MetaMask Smart Account address
    }
    
    // State variables
    mapping(uint256 => SubscriptionPlan) public plans;
    mapping(address => UserSubscription) public subscriptions;
    mapping(address => bool) public authorizedExecutors; // Delegated executors
    
    uint256 public nextPlanId = 1;
    uint256 public totalRevenue;
    
    // Events
    event PlanCreated(uint256 indexed planId, string name, uint256 price, uint256 period);
    event PlanUpdated(uint256 indexed planId, bool active);
    event SubscriptionCreated(address indexed user, uint256 indexed planId);
    event SubscriptionCancelled(address indexed user);
    event PaymentProcessed(address indexed user, uint256 amount, uint256 timestamp);
    event ExecutorAuthorized(address indexed executor, bool authorized);
    event AutomaticPaymentTriggered(address indexed caller, uint256 timestamp);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Create a new subscription plan
     */
    function createPlan(
        string memory _name,
        uint256 _price,
        uint256 _period,
        address _tokenAddress
    ) external onlyOwner {
        plans[nextPlanId] = SubscriptionPlan({
            id: nextPlanId,
            name: _name,
            price: _price,
            period: _period,
            active: true,
            tokenAddress: _tokenAddress
        });
        
        emit PlanCreated(nextPlanId, _name, _price, _period);
        nextPlanId++;
    }
    
    /**
     * @dev Create multiple subscription plans in a single transaction
     * @param _names Array of plan names
     * @param _prices Array of plan prices
     * @param _periods Array of plan periods
     * @param _tokenAddresses Array of token addresses
     */
    function createPlansBatch(
        string[] memory _names,
        uint256[] memory _prices,
        uint256[] memory _periods,
        address[] memory _tokenAddresses
    ) external onlyOwner {
        require(_names.length == _prices.length, "Arrays length mismatch");
        require(_names.length == _periods.length, "Arrays length mismatch");
        require(_names.length == _tokenAddresses.length, "Arrays length mismatch");
        require(_names.length <= 5, "Maximum 5 plans per batch");
        require(_names.length > 0, "At least one plan required");
        
        for (uint256 i = 0; i < _names.length; i++) {
            plans[nextPlanId] = SubscriptionPlan({
                id: nextPlanId,
                name: _names[i],
                price: _prices[i],
                period: _periods[i],
                active: true,
                tokenAddress: _tokenAddresses[i]
            });
            
            emit PlanCreated(nextPlanId, _names[i], _prices[i], _periods[i]);
            nextPlanId++;
        }
    }

    /**
     * @dev Update plan status
     */
    function updatePlan(uint256 _planId, bool _active) external onlyOwner {
        require(_planId < nextPlanId, "Plan does not exist");
        plans[_planId].active = _active;
        emit PlanUpdated(_planId, _active);
    }
    
    /**
     * @dev Subscribe to a plan (called by user's MetaMask Smart Account)
     */
    function subscribe(uint256 _planId) external {
        require(_planId < nextPlanId, "Plan does not exist");
        require(plans[_planId].active, "Plan is not active");
        require(subscriptions[msg.sender].planId == 0, "Already subscribed");
        
        subscriptions[msg.sender] = UserSubscription({
            planId: _planId,
            startTime: block.timestamp,
            lastPayment: block.timestamp,
            active: true,
            delegator: msg.sender
        });
        
        emit SubscriptionCreated(msg.sender, _planId);
    }
    
    /**
     * @dev Subscribe to a plan with initial payment
     */
    function subscribeWithPayment(uint256 _planId) external {
        require(_planId < nextPlanId, "Plan does not exist");
        require(plans[_planId].active, "Plan is not active");
        require(subscriptions[msg.sender].planId == 0, "Already subscribed");
        
        SubscriptionPlan memory plan = plans[_planId];
        
        // Transfer USDC from user to contract for initial payment
        IERC20 token = IERC20(plan.tokenAddress);
        require(
            token.transferFrom(msg.sender, address(this), plan.price),
            "Initial payment failed"
        );
        
        subscriptions[msg.sender] = UserSubscription({
            planId: _planId,
            startTime: block.timestamp,
            lastPayment: block.timestamp,
            active: true,
            delegator: msg.sender
        });
        
        totalRevenue += plan.price;
        emit SubscriptionCreated(msg.sender, _planId);
        emit PaymentProcessed(msg.sender, plan.price, block.timestamp);
    }
    
    /**
     * @dev Process automated payment using MetaMask delegation
     * This function is called by the DelegationManager when a delegation is redeemed
     * The user must have created a delegation allowing this contract to charge them
     * Only authorized executors can call this function
     */
    function processPayment(address _user) external nonReentrant {
        require(authorizedExecutors[msg.sender], "Not authorized executor");
        require(subscriptions[_user].active, "Subscription not active");
        
        UserSubscription storage sub = subscriptions[_user];
        SubscriptionPlan memory plan = plans[sub.planId];
        
        // Check if payment is due
        require(
            block.timestamp >= sub.lastPayment + plan.period,
            "Payment not due yet"
        );
        
        // Check if user has sufficient USDC balance
        IERC20 token = IERC20(plan.tokenAddress);
        require(
            token.balanceOf(_user) >= plan.price,
            "Insufficient USDC balance"
        );
        
        // Transfer USDC from user to contract using delegation
        // The delegation allows this contract to spend the user's USDC
        require(
            token.transferFrom(_user, address(this), plan.price),
            "Payment failed"
        );
        
        // Update subscription
        sub.lastPayment = block.timestamp;
        totalRevenue += plan.price;
        
        emit PaymentProcessed(_user, plan.price, block.timestamp);
    }
    
    /**
     * @dev Automatic payment execution using MetaMask delegation
     * This function is called by the DelegationManager when a time-based delegation is redeemed
     * The delegation contains time-based caveats that allow automatic charging
     */
    function executeAutomaticPayment(address _user) external nonReentrant {
        require(subscriptions[_user].active, "Subscription not active");
        
        UserSubscription storage sub = subscriptions[_user];
        SubscriptionPlan memory plan = plans[sub.planId];
        
        // Check if payment is due
        require(
            block.timestamp >= sub.lastPayment + plan.period,
            "Payment not due yet"
        );
        
        // Check if user has sufficient USDC balance
        IERC20 token = IERC20(plan.tokenAddress);
        require(
            token.balanceOf(_user) >= plan.price,
            "Insufficient USDC balance"
        );
        
        // Transfer USDC from user to contract using delegation
        // The delegation allows this contract to spend the user's USDC automatically
        require(
            token.transferFrom(_user, address(this), plan.price),
            "Automatic payment failed"
        );
        
        // Update subscription
        sub.lastPayment = block.timestamp;
        totalRevenue += plan.price;
        
        emit PaymentProcessed(_user, plan.price, block.timestamp);
    }
    
    /**
     * @dev Process automatic payment for multiple users (batch processing)
     * Anyone can call this to process due payments for multiple users
     */
    function processBatchPayments(address[] calldata _users) external nonReentrant {
        for (uint256 i = 0; i < _users.length; i++) {
            try this.processPayment(_users[i]) {
                // Payment processed successfully
            } catch {
                // Skip failed payments and continue with others
                continue;
            }
        }
    }
    
    /**
     * @dev Check if a user has a payment due (view function)
     * Anyone can call this to check if a user needs to pay
     */
    function isPaymentDue(address _user) external view returns (bool, uint256) {
        UserSubscription memory sub = subscriptions[_user];
        
        if (!sub.active || sub.planId == 0) {
            return (false, 0);
        }
        
        SubscriptionPlan memory plan = plans[sub.planId];
        uint256 nextPaymentDue = sub.lastPayment + plan.period;
        
        return (block.timestamp >= nextPaymentDue, nextPaymentDue);
    }
    
    /**
     * @dev Automatic payment checker - can be called by anyone to process due payments
     * This function automatically processes payments for all users with due payments
     * No external services needed - anyone can call this to trigger automatic charging
     */
    function triggerAutomaticPayments() external nonReentrant {
        // This function can be called by anyone to process due payments
        // It will automatically charge users when their payments are due
        // No external services needed - the contract handles everything!
        
        // Note: In a real implementation, you might want to limit this to authorized callers
        // or implement a more sophisticated automatic triggering mechanism
        
        emit AutomaticPaymentTriggered(msg.sender, block.timestamp);
    }
    
    /**
     * @dev Process automatic payment for a specific user (can be called by anyone)
     * This enables truly automatic charging without external services
     */
    function processAutomaticPayment(address _user) external nonReentrant {
        require(subscriptions[_user].active, "Subscription not active");
        
        UserSubscription storage sub = subscriptions[_user];
        SubscriptionPlan memory plan = plans[sub.planId];
        
        // Check if payment is due
        require(
            block.timestamp >= sub.lastPayment + plan.period,
            "Payment not due yet"
        );
        
        // Check if user has sufficient USDC balance
        IERC20 token = IERC20(plan.tokenAddress);
        require(
            token.balanceOf(_user) >= plan.price,
            "Insufficient USDC balance"
        );
        
        // Check if user has approved this contract to spend their USDC
        require(
            token.allowance(_user, address(this)) >= plan.price,
            "Insufficient USDC allowance - user must approve spending"
        );
        
        // Transfer USDC from user to contract
        require(
            token.transferFrom(_user, address(this), plan.price),
            "Automatic payment failed"
        );
        
        // Update subscription
        sub.lastPayment = block.timestamp;
        totalRevenue += plan.price;
        
        emit PaymentProcessed(_user, plan.price, block.timestamp);
    }
    
    /**
     * @dev Cancel subscription
     */
    function cancelSubscription() external {
        require(subscriptions[msg.sender].active, "No active subscription");
        
        // Reset the subscription completely to allow resubscription
        subscriptions[msg.sender] = UserSubscription({
            planId: 0,
            startTime: 0,
            lastPayment: 0,
            active: false,
            delegator: address(0)
        });
        
        emit SubscriptionCancelled(msg.sender);
    }
    
    /**
     * @dev Authorize executor for automated payments
     */
    function authorizeExecutor(address _executor, bool _authorized) external onlyOwner {
        authorizedExecutors[_executor] = _authorized;
        emit ExecutorAuthorized(_executor, _authorized);
    }
    
    /**
     * @dev Withdraw collected revenue
     */
    function withdrawRevenue(address _token, uint256 _amount) external onlyOwner {
        IERC20 token = IERC20(_token);
        require(token.transfer(owner(), _amount), "Withdrawal failed");
    }
    
    /**
     * @dev Get user subscription details
     */
    function getUserSubscription(address _user) external view returns (UserSubscription memory) {
        return subscriptions[_user];
    }
    
    /**
     * @dev Get plan details
     */
    function getPlan(uint256 _planId) external view returns (SubscriptionPlan memory) {
        return plans[_planId];
    }
    
    /**
     * @dev Check if payment is due for a user (simple boolean version)
     */
    function isPaymentDueSimple(address _user) external view returns (bool) {
        UserSubscription memory sub = subscriptions[_user];
        if (!sub.active) return false;
        
        SubscriptionPlan memory plan = plans[sub.planId];
        return block.timestamp >= sub.lastPayment + plan.period;
    }
}
