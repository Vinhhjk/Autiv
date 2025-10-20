import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Monitor, Home } from 'lucide-react'
import ConnectButton from './ConnectButton'
import MobileMenu from './MobileMenu'
import { useNavigation } from '../hooks/useNavigation'
import { useAccount } from '../hooks/usePrivyWagmiAdapter'

const Header = () => {
    const { isCurrentPath, routes } = useNavigation()
    const { isConnected } = useAccount()

    const navLinks = [
        { name: 'Demo', path: routes.demo },
        { name: 'Docs', path: routes.docs },
        { name: 'Developers', path: routes.developers }
    ]

    return (
        <header className="sticky top-0 z-50" style={{ backgroundColor: '#ffffff', borderBottom: '4px solid #000000' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-20">
                    {/* Logo */}
                    <Link to={routes.home} className="flex items-center space-x-4 group">
                        <div className="relative">
                            <div
                                className="w-16 h-16 flex items-center justify-center transition-transform duration-300 hover:scale-105"
                                style={{ backgroundColor: '#feca57', border: '3px solid #000000' }}
                            >
                                <Monitor className="w-9 h-9 text-black" />
                            </div>
                        </div>
                        <span className="text-4xl font-black text-black">AUTIV</span>
                    </Link>

                    {/* Navigation */}
                    <nav className="hidden md:flex items-center space-x-6">
                                              {/* Home Link - Only show when connected */}
                                              {isConnected && (
                            <motion.div
                                whileHover={{ x: 1, y: 1, boxShadow: isCurrentPath(routes.userHome) ? '2px 2px 0px #000000' : '1px 1px 0px #000000' }}
                                whileTap={{ x: 2, y: 2, boxShadow: isCurrentPath(routes.userHome) ? '1px 1px 0px #000000' : 'none' }}
                                transition={{ duration: 0.1 }}
                                style={{
                                    backgroundColor: isCurrentPath(routes.userHome) ? '#4ecdc4' : '#ffffff',
                                    color: '#000000',
                                    border: '2px solid #000000',
                                    boxShadow: isCurrentPath(routes.userHome)
                                        ? '3px 3px 0px #000000'
                                        : '2px 2px 0px #000000'
                                }}
                            >
                                <Link
                                    to={routes.userHome}
                                    className="px-6 py-3 font-bold text-lg flex items-center"
                                >
                                    <Home className="w-5 h-5 mr-2" />
                                    Home
                                </Link>
                            </motion.div>
                        )}
                        {navLinks.map((link, index) => (
                            <motion.div
                                key={link.name}
                                whileHover={{ x: 1, y: 1, boxShadow: isCurrentPath(link.path) ? '2px 2px 0px #000000' : '1px 1px 0px #000000' }}
                                whileTap={{ x: 2, y: 2, boxShadow: isCurrentPath(link.path) ? '1px 1px 0px #000000' : 'none' }}
                                transition={{ duration: 0.1 }}
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
                                <Link
                                    to={link.path}
                                    className="px-6 py-3 font-bold text-lg block"
                                >
                                    {link.name}
                                </Link>
                            </motion.div>
                        ))}
                        
  
                    </nav>

                    {/* Desktop Wallet Connect Button */}
                    <div className="hidden md:block">
                        <ConnectButton />
                    </div>

                    {/* Mobile Menu */}
                    <MobileMenu />
                </div>
            </div>
        </header>
    )
}

export default Header