import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw, Shield, Zap, Tv, Gamepad2 } from 'lucide-react'
import { motion } from 'framer-motion'

const Landing = () => {
    const features = [
        {
            icon: <Zap className="w-14 h-14 text-black" />,
            title: "One-click setup",
            description: "Deploy subscription contracts with a single transaction on Monad testnet",
            bgColor: "bg-retro-yellow",
            shadowColor: "#ff6b6b"
        },
        {
            icon: <RefreshCw className="w-14 h-14 text-black" />,
            title: "Auto-renewal",
            description: "Smart contracts automatically process payments when due",
            bgColor: "bg-retro-cyan",
            shadowColor: "#4ecdc4"
        },
        {
            icon: <Shield className="w-14 h-14 text-black" />,
            title: "Full control",
            description: "Users can pause, modify, or cancel subscriptions anytime",
            bgColor: "bg-retro-green",
            shadowColor: "#96ceb4"
        }
    ]

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Retro Geometric Shapes */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-16 h-16 transform rotate-45" style={{ backgroundColor: '#ff6b6b' }}></div>
                <div className="absolute top-40 right-20 w-12 h-12 rounded-full" style={{ backgroundColor: '#feca57' }}></div>
                <div className="absolute bottom-40 left-20 w-20 h-20" style={{ backgroundColor: '#4ecdc4' }}></div>
                <div className="absolute bottom-20 right-10 w-14 h-14 rounded-full" style={{ backgroundColor: '#836EF9' }}></div>
            </div>

            {/* Hero Section */}
            <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto text-center">
                    {/* Removed badge for cleaner, more professional look */}

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="text-6xl md:text-8xl font-black text-black mb-8 leading-tight"
                    >
                        Automate your{' '}
                        <span className="gradient-text">
                            onchain subscriptions
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                        className="text-2xl text-gray-800 mb-10 max-w-4xl mx-auto font-medium"
                    >
                        Pays on time, every time.
                        Built on the <span className="font-bold" style={{ color: '#836EF9' }}>Monad</span> blockchain with seamless integration.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.6 }}
                        className="flex flex-col sm:flex-row gap-4 justify-center items-center"
                    >
                        <Link
                            to="/demo"
                            className="retro-button px-8 py-4 font-bold text-lg"
                        >
                            <div className="flex items-center space-x-2">
                                <Tv className="w-5 h-5" />
                                <span>Try Demo</span>
                            </div>
                        </Link>

                        <button className="bg-white border-2 border-black px-6 py-3 font-bold hover:bg-gray-100 transition-colors shadow-[2px_2px_0px_#000]">
                            <Gamepad2 className="w-5 h-5 inline mr-2" />
                            View Documentation
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* Features Section */}
            <section className="relative py-16 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="grid md:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: index * 0.2 }}
                                className="retro-card p-8"
                                style={{ animationDelay: `${index * 0.2}s` }}
                            >
                                <div
                                    className="w-24 h-24 flex items-center justify-center mb-8"
                                    style={{ backgroundColor: feature.bgColor === 'bg-retro-yellow' ? '#feca57' : feature.bgColor === 'bg-retro-cyan' ? '#4ecdc4' : '#96ceb4', border: '3px solid #000000' }}
                                >
                                    {feature.icon}
                                </div>
                                <h3 className="text-3xl font-black text-black mb-6">
                                    {feature.title}
                                </h3>
                                <p className="text-gray-700 text-xl leading-relaxed font-medium">
                                    {feature.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Retro Components Showcase */}
            <section className="relative py-16 px-4 sm:px-6 lg:px-8">
                <div className="max-w-6xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        whileHover={{ y: -6, scale: 1.02 }}
                        transition={{ duration: 0.3 }}
                        className="bg-white border-4 border-black p-12 transition-all duration-300"
                        style={{
                            boxShadow: '10px 10px 0px #000000'
                        }}
                    >
                        <div className="text-center">
                            <div className="w-24 h-24 y2k-gradient rounded-full mx-auto mb-6 flex items-center justify-center" style={{ border: '3px solid #000000' }}>
                                <RefreshCw className="w-12 h-12 text-black" />
                            </div>
                            <h3 className="text-4xl font-black text-black mb-4">
                                Blockchain-Powered Subscriptions
                            </h3>
                            <p className="text-xl text-gray-700 max-w-2xl mx-auto mb-8 leading-relaxed">
                                Built on Monad's high-performance blockchain. Secure, transparent, and
                                fully decentralized subscription management for the Web3 era.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Link
                                    to="/demo"
                                    className="retro-button px-6 py-3 font-bold text-lg"
                                >
                                    <div className="flex items-center space-x-2">
                                        <span>Try Demo</span>
                                        <ArrowRight size={20} />
                                    </div>
                                </Link>
                                <button className="bg-black text-white border-2 border-black px-6 py-3 font-bold hover:bg-gray-800 transition-colors">
                                    Learn More
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    )
}

export default Landing