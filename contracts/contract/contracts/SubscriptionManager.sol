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
    
    uint256 public nextPlanId = 1;
    uint256 public totalRevenue;
    uint256 public constant MAX_PLANS = 5;
    
    // Events
    event PlanCreated(uint256 indexed planId, string name, uint256 price, uint256 period);
    event PlanUpdated(uint256 indexed planId, uint256 oldPrice, uint256 newPrice);
    event SubscriptionCreated(address indexed user, uint256 indexed planId);
    event SubscriptionCancelled(address indexed user);
    event PaymentProcessed(address indexed user, uint256 amount, uint256 timestamp);
    
    constructor() Ownable(msg.sender) {}
    
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
        require(_names.length > 0, "At least one plan required");
        require(nextPlanId + _names.length - 1 <= MAX_PLANS, "Exceeds maximum plans limit");
        
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
     * @dev Update plan price
     */
    function updatePlan(uint256 _planId, uint256 _newPrice) external onlyOwner {
        require(_planId < nextPlanId, "Plan does not exist");
        SubscriptionPlan storage plan = plans[_planId];
        uint256 oldPrice = plan.price;
        plan.price = _newPrice;
        emit PlanUpdated(_planId, oldPrice, _newPrice);
    }
    
    /**
     * @dev Subscribe to a plan with initial payment
     */
    function subscribeWithPayment(uint256 _planId) external {
        require(_planId < nextPlanId, "Plan does not exist");
        require(plans[_planId].active, "Plan is not active");
        require(subscriptions[msg.sender].planId == 0, "Already subscribed");
        
        SubscriptionPlan memory plan = plans[_planId];
        
        // Transfer ERC20 token from user to contract for initial payment
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
     * @dev Process payment for subscription
     * Users can only pay for their own subscriptions
     */
    function processPayment(address _user) external nonReentrant {
        require(msg.sender == _user, "Can only pay for your own subscription");
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
    
}
