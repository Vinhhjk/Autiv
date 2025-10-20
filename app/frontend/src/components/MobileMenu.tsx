import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X, Home } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ConnectButton from './ConnectButton'
import { useNavigation } from '../hooks/useNavigation'
import { useAccount } from '../hooks/usePrivyWagmiAdapter'

export default function MobileMenu() {
    const [isOpen, setIsOpen] = useState(false)
    const { isCurrentPath, routes } = useNavigation()
    const { isConnected } = useAccount()

    const navLinks = [
        { name: 'Demo', path: routes.demo },
        { name: 'Docs', path: routes.docs },
        { name: 'Developers', path: routes.developers }
    ]

    const toggleMenu = () => setIsOpen(!isOpen)
    const closeMenu = () => setIsOpen(false)

    // Prevent body scroll when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('mobile-menu-open')
        } else {
            document.body.classList.remove('mobile-menu-open')
        }

        // Cleanup on unmount
        return () => {
            document.body.classList.remove('mobile-menu-open')
        }
    }, [isOpen])

    return (
        <>
            {/* Hamburger Button */}
            <button
                onClick={toggleMenu}
                className="md:hidden p-2 font-bold text-lg transition-all duration-200 hover:transform hover:-translate-y-1"
                style={{
                    backgroundColor: '#feca57',
                    color: '#000000',
                    border: '2px solid #000000',
                    boxShadow: '2px 2px 0px #000000'
                }}
                aria-label="Toggle menu"
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop with Blur */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 backdrop-blur-sm bg-white/20 mobile-menu-backdrop z-40 md:hidden"
                            onClick={closeMenu}
                        />

                        {/* Menu Panel */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'tween', duration: 0.3 }}
                            className="fixed top-0 right-0 h-full w-80 z-50 md:hidden mobile-menu-panel"
                            style={{
                                backgroundColor: '#ffffff',
                                border: '4px solid #000000',
                                borderRight: 'none'
                            }}
                        >
                            {/* Menu Header */}
                            <div className="flex items-center justify-between p-6 border-b-2 border-black">
                                <h2 className="text-2xl font-black text-black">MENU</h2>
                                <button
                                    onClick={closeMenu}
                                    className="p-2"
                                    style={{
                                        backgroundColor: '#ff6b6b',
                                        color: '#000000',
                                        border: '2px solid #000000',
                                        boxShadow: '2px 2px 0px #000000'
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Navigation Links */}
                            <nav className="p-6">
                                <div className="space-y-4">
                                    {navLinks.map((link, index) => (
                                        <Link
                                            key={link.name}
                                            to={link.path}
                                            onClick={closeMenu}
                                            className="block w-full px-4 py-3 font-bold text-lg transition-all duration-200 hover:transform hover:-translate-y-1"
                                            style={{
                                                backgroundColor: isCurrentPath(link.path) ? '#feca57' : '#ffffff',
                                                color: '#000000',
                                                border: '2px solid #000000',
                                                boxShadow: isCurrentPath(link.path)
                                                    ? '3px 3px 0px #000000'
                                                    : '2px 2px 0px #000000',
                                                animationDelay: `${index * 0.1}s`
                                            }}
                                        >
                                            {link.name}
                                        </Link>
                                    ))}

                                    {/* Home Link - Only show when connected */}
                                    {isConnected && (
                                        <Link
                                            to={routes.userHome}
                                            onClick={closeMenu}
                                            className="w-full px-4 py-3 font-bold text-lg transition-all duration-200 hover:transform hover:-translate-y-1 flex items-center"
                                            style={{
                                                backgroundColor: isCurrentPath(routes.userHome) ? '#4ecdc4' : '#ffffff',
                                                color: '#000000',
                                                border: '2px solid #000000',
                                                boxShadow: isCurrentPath(routes.userHome)
                                                    ? '3px 3px 0px #000000'
                                                    : '2px 2px 0px #000000'
                                            }}
                                        >
                                            <Home className="w-5 h-5 mr-2" />
                                            Home
                                        </Link>
                                    )}
                                </div>

                                {/* Wallet Connection */}
                                <div className="mt-8 pt-6 border-t-2 border-black">
                                    <p className="text-sm font-medium text-gray-600 mb-3">Wallet Connection</p>
                                    <ConnectButton />
                                </div>
                            </nav>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}