import { usePrivy } from '@privy-io/react-auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ChevronDown, Key, LogOut } from 'lucide-react';
import { useSmartAccount } from '../hooks/useSmartAccount';

// Global flag to prevent multiple smart account creation attempts
let isCreatingSmartAccount = false;
interface ConnectButtonProps {
    isSidebarOpen?: boolean;
    onExportWallet?: () => void;
}

export default function ConnectButton({ isSidebarOpen = false, onExportWallet }: ConnectButtonProps) {
    const { ready, authenticated, user, login, logout, exportWallet } = usePrivy();
    
    const navigate = useNavigate();
    const location = useLocation();
    const [showDropdown, setShowDropdown] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState<'left' | 'right'>('right');
    const [isExporting, setIsExporting] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    // Smart account management
    const { createSmartAccount, smartAccountResult, isWalletClientReady } = useSmartAccount();
        

    // Get the wallet address
    const address = user?.wallet?.address;
    const isConnected = authenticated && !!address;
    
    // Extract email from linkedAccounts
    const emailAccount = user?.linkedAccounts?.find((account) => account.type === 'email');
    const userEmail = emailAccount && 'address' in emailAccount ? emailAccount.address : '';
    
    // Create a shortened email format (abc..123@gmail.com)
    const shortenedEmail = userEmail
        ? (() => {
            const [localPart, domain] = userEmail.split('@');
            if (!domain) return userEmail; // If no @, return as is
            
            if (localPart.length > 6) {
                // Show first 2 chars + .. + last 3 chars before @
                const shortened = `${localPart.substring(0, 2)}..${localPart.substring(localPart.length - 3)}@${domain}`;
                return shortened;
            }
            return userEmail; // If local part is short, show full email
          })()
        : '';
    
    // Create a shortened address format
    const shortenedAddress = address
        ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
        : '';

    // Redirect to /home after successful connection (but only from landing page)
    useEffect(() => {
        if (isConnected && location.pathname === '/') {
            navigate('/home');
        }
    }, [isConnected, navigate, location.pathname]);

        // Auto-create smart account when user connects and wallet is ready
        useEffect(() => {
            const autoCreateSmartAccount = async () => {
                if (!isConnected || !address) return;
            
            // Check if smart account already exists in localStorage
            const existingSmartAccount = localStorage.getItem('autiv.smartAccount');
            if (existingSmartAccount) {
                // console.log('Smart account already exists for this user');
                return;
            }
            
            // Check if we already have a smart account result
            if (smartAccountResult) {
                // console.log('Smart account already created in this session');
                return;
            }

            // Check if another instance is already creating a smart account
            if (isCreatingSmartAccount) {
                // console.log('Smart account creation already in progress...');
                return;
            }
            
            // Wait for wallet client to be ready
            if (!isWalletClientReady) {
                // console.log('Waiting for wallet client to be ready...');
                return;
            }
            
            try {
                // console.log('Auto-creating smart account for new user...');
                isCreatingSmartAccount = true;
                
                const result = await createSmartAccount();
                if (result) {
                    // Store in localStorage using the expected key format
                    localStorage.setItem('autiv.smartAccount', JSON.stringify({
                        address: result.smartAccount.address,
                        isDeployed: result.isDeployed,
                        createdAt: new Date().toISOString()
                    }));
                    
                    console.log('Smart account created and stored:', result.smartAccount.address);
                }
            } catch (error) {
                console.error('Failed to auto-create smart account:', error);
            } finally {
                isCreatingSmartAccount = false;
            }
        };
        
        autoCreateSmartAccount();
    }, [isConnected, address, createSmartAccount, smartAccountResult, isWalletClientReady]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                // Don't close if we're exporting (Privy modal is open)
                if (!isExporting) {
                    setShowDropdown(false);
                }
            }
        };

        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDropdown, isExporting]);

    // Listen for Privy modal close events
    useEffect(() => {
        if (!isExporting) return;

        const timeoutId = setTimeout(() => {
            setIsExporting(false);
        }, 3000);

        // Use MutationObserver to detect when Privy modal is removed from DOM
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Check if any removed nodes contain Privy modal elements
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as Element;
                            // Look for Privy modal indicators
                            if (element.querySelector('[data-testid*="privy"]') || 
                                element.querySelector('[class*="privy"]') ||
                                element.querySelector('[class*="modal"]') ||
                                element.classList.contains('privy-modal') ||
                                element.getAttribute('data-privy-modal')) {
                                // Privy modal was removed, reset state immediately
                                clearTimeout(timeoutId);
                                setIsExporting(false);
                            }
                        }
                    });
                }
            });
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also listen for escape key (common way to close modals)
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isExporting) {
                clearTimeout(timeoutId);
                setIsExporting(false);
            }
        };

        // Listen for focus events (when user clicks outside Privy modal)
        const handleFocus = () => {
            if (isExporting) {
                clearTimeout(timeoutId);
                setIsExporting(false);
            }
        };

        // Listen for clicks on document (when user clicks outside Privy modal)
        const handleDocumentClick = (e: MouseEvent) => {
            if (isExporting) {
                // Check if click is outside any Privy modal elements
                const target = e.target as Element;
                const isPrivyElement = target.closest('[data-testid*="privy"]') || 
                                     target.closest('[class*="privy"]') ||
                                     target.closest('[class*="modal"]');
                
                if (!isPrivyElement) {
                    clearTimeout(timeoutId);
                    setIsExporting(false);
                }
            }
        };

        document.addEventListener('keydown', handleEscape);
        window.addEventListener('focus', handleFocus);
        document.addEventListener('click', handleDocumentClick);

        return () => {
            clearTimeout(timeoutId);
            observer.disconnect();
            document.removeEventListener('keydown', handleEscape);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('click', handleDocumentClick);
        };
    }, [isExporting]);

    const handleConnect = () => {
        if (isConnected) {
            // Calculate dropdown position based on available space and sidebar state
            if (dropdownRef.current) {
                const rect = dropdownRef.current.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const dropdownWidth = 256; // w-64 = 16rem = 256px
                
                // On mobile or when sidebar is open, prefer left positioning
                if (isSidebarOpen || window.innerWidth < 768) {
                    setDropdownPosition('left');
                } else if (rect.right + dropdownWidth > viewportWidth) {
                    setDropdownPosition('left');
                } else {
                    setDropdownPosition('right');
                }
            }
            setShowDropdown(!showDropdown);
        } else {
            login();
        }
    };

    const handleDisconnect = () => {
        logout();
        setShowDropdown(false);
    };




    const handleExportWallet = async () => {
        try {
            setIsExporting(true);
            // Notify parent component (Sidebar) that export is starting
            if (onExportWallet) {
                onExportWallet();
            }
            // Simple export for embedded wallets
            await exportWallet();
        } catch (error) {
            console.error('Failed to export wallet:', error);
            alert('Failed to export wallet. Please try again.');
            setIsExporting(false);
        }
        // Note: We don't reset isExporting here - let the user manually close the popup
    };

    if (!ready) {
        return (
            <button
                disabled
                className="px-6 py-3 font-bold text-lg opacity-50 cursor-not-allowed"
                style={{
                    backgroundColor: '#feca57',
                    color: '#000000',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                }}
            >
                <div className="flex items-center gap-2">
                    <Wallet size={22} />
                    <span>Loading...</span>
                </div>
            </button>
        );
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <motion.button
                onClick={handleConnect}
                whileHover={{ x: 1, y: 1, boxShadow: isConnected ? '2px 2px 0px #000000' : '1px 1px 0px #000000' }}
                whileTap={{ x: isConnected ? 2 : 1, y: isConnected ? 2 : 1, boxShadow: isConnected ? '1px 1px 0px #000000' : 'none' }}
                transition={{ duration: 0.1 }}
                className="w-full px-4 py-3 font-bold text-sm md:text-base"
                style={{
                    backgroundColor: isConnected ? '#4ecdc4' : '#feca57',
                    color: '#000000',
                    border: '2px solid #000000',
                    boxShadow: isConnected
                        ? '3px 3px 0px #000000'
                        : '2px 2px 0px #000000'
                }}
                aria-label={isConnected ? `Connected as ${shortenedEmail || shortenedAddress}` : 'Connect wallet'}
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Wallet size={20} className="flex-shrink-0" />
                        {isConnected ? (
                            <span className="truncate text-left">{shortenedEmail || shortenedAddress}</span>
                        ) : (
                            <span>Login</span>
                        )}
                    </div>
                    {isConnected && <ChevronDown size={16} className="flex-shrink-0" />}
                </div>
            </motion.button>

            {/* Mobile Popup Modal with Animations */}
            <AnimatePresence>
                {isConnected && showDropdown && (
                    <>
                        {/* Mobile Backdrop with Fade Animation */}
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 md:hidden"
                            onClick={() => {
                                // Don't close if we're exporting (Privy modal is open)
                                if (!isExporting) {
                                    setShowDropdown(false);
                                }
                            }}
                        />
                        
                        {/* Mobile Modal with Scale and Fade Animation */}
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ 
                                duration: 0.3, 
                                ease: "easeOut",
                                type: "spring",
                                stiffness: 300,
                                damping: 30
                            }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:hidden"
                            onClick={(e) => {
                                // Close modal when clicking outside the content, but not when exporting
                                if (e.target === e.currentTarget && !isExporting) {
                                    setShowDropdown(false);
                                }
                            }}
                        >
                            <motion.div 
                                initial={{ y: 20 }}
                                animate={{ y: 0 }}
                                transition={{ 
                                    duration: 0.3, 
                                    ease: "easeOut",
                                    delay: 0.1
                                }}
                                className="w-full max-w-sm bg-white border-2 border-black shadow-lg"
                                style={{ boxShadow: '4px 4px 0px #000000' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="p-6">
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: 0.2 }}
                                        className="mb-4"
                                    >
                                        <h3 className="text-lg font-bold text-black mb-2">Options</h3>
                                    </motion.div>
                                    
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: 0.3 }}
                                        className="space-y-2"
                                    >
                                        <motion.button
                                            whileHover={{ x: 1, y: 1 }}
                                            whileTap={{ x: 2, y: 2 }}
                                            transition={{ duration: 0.1 }}
                                            onClick={handleExportWallet}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-purple-50 text-purple-700 transition-colors border border-gray-200 rounded"
                                        >
                                            <Key size={18} />
                                            <span>Export Wallet</span>
                                        </motion.button>
                                        
                                        <motion.button
                                            whileHover={{ x: 1, y: 1 }}
                                            whileTap={{ x: 2, y: 2 }}
                                            transition={{ duration: 0.1 }}
                                            onClick={handleDisconnect}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 text-red-600 transition-colors border border-gray-200 rounded"
                                        >
                                            <LogOut size={18} />
                                            <span>Logout</span>
                                        </motion.button>
                                    </motion.div>
                                    
                                    <motion.button
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: 0.4 }}
                                        whileHover={{ x: 1, y: 1 }}
                                        whileTap={{ x: 2, y: 2 }}
                                        onClick={() => setShowDropdown(false)}
                                        className="w-full mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 transition-colors border border-gray-300 rounded"
                                    >
                                        Cancel
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            
                {/* Desktop Dropdown with Animations */}
                <AnimatePresence>
                    {isConnected && showDropdown && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ 
                                duration: 0.2, 
                                ease: "easeOut",
                                type: "spring",
                                stiffness: 300,
                                damping: 30
                            }}
                            className={`hidden md:block absolute top-full mt-2 w-64 sm:w-72 bg-white border-2 border-black shadow-lg z-50 ${
                                dropdownPosition === 'right' 
                                    ? 'right-0 left-0' 
                                    : 'left-0 right-0'
                            }`}
                            style={{ boxShadow: '4px 4px 0px #000000' }}
                        >
                            <div className="p-4">   
                                <motion.div 
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.1 }}
                                    className="space-y-2"
                                >
                                    <motion.button
                                        whileHover={{ x: 1, y: 1 }}
                                        whileTap={{ x: 2, y: 2 }}
                                        transition={{ duration: 0.1 }}
                                        onClick={handleExportWallet}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-50 text-purple-700 transition-colors"
                                    >
                                        <Key size={16} />
                                        <span>Export Wallet</span>
                                    </motion.button>
                                    
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.3, delay: 0.3 }}
                                        className="border-t border-gray-200 my-2"
                                    ></motion.div>
                                    
                                    <motion.button
                                        whileHover={{ x: 1, y: 1 }}
                                        whileTap={{ x: 2, y: 2 }}
                                        transition={{ duration: 0.1 }}
                                        onClick={handleDisconnect}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50 text-red-600 transition-colors"
                                    >
                                        <LogOut size={16} />
                                        <span>Logout</span>
                                    </motion.button>
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
        </div>
    );
}