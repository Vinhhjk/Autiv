import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, ExternalLink, Code, Book, Github } from 'lucide-react'

const Developers = () => {
  const [copied, setCopied] = useState(false)

  const codeSnippet = `import { payWithAutiv } from "@Vinhhjk/autiv/autiv-sdk";

payWithAutiv({
  planId: id,
  projectId: "<YOUR_PROJECT_ID>",
  apiKey: "<YOUR_API_KEY>",
})
`

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const features = [
    {
      icon: <Code className="w-8 h-8 text-blue-500" />,
      title: "Simple Integration",
      description: "Add subscription functionality with just a few lines of code"
    },
    {
      icon: <Book className="w-8 h-8 text-blue-500" />,
      title: "Comprehensive Docs",
      description: "Detailed documentation and examples to get you started quickly"
    },
    {
      icon: <Github className="w-8 h-8 text-blue-500" />,
      title: "Open Source",
      description: "Built in the open with community contributions welcome"
    }
  ]

  return (
    <div className="min-h-screen pt-8 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Integrate subscriptions in{' '}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">
              few lines of code
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Build recurring payment flows with Autiv's simple SDK. 
            Powered by Monad blockchain and MetaMask Smart Accounts.
          </p>
        </motion.div>

        {/* Code Snippet */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-16"
        >
          <div className="bg-gray-900 rounded-2xl p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span className="text-sm">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <pre className="text-green-400 font-mono text-sm overflow-x-auto">
              <code>{codeSnippet}</code>
            </pre>
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid md:grid-cols-3 gap-8 mb-16"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-600">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* API Key Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-blue-50 rounded-2xl p-8 mb-16"
        >
          <h3 className="text-2xl font-semibold text-gray-900 mb-4">
            Get Started with Sandbox
          </h3>
          <p className="text-gray-600 mb-6">
            Use our sandbox environment to test integrations without real transactions.
          </p>
          
          <div className="bg-white rounded-xl p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Sandbox API Key</p>
                <code className="text-sm text-gray-600 font-mono">
                  sk_sandbox_1234567890abcdef...
                </code>
              </div>
              <button className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
                Generate Key
              </button>
            </div>
          </div>
        </motion.div>

        {/* Links Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid md:grid-cols-2 gap-6"
        >
          <a
            href="#"
            className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow group"
          >
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                Documentation
              </h4>
              <p className="text-gray-600">
                Complete API reference and integration guides
              </p>
            </div>
            <ExternalLink className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </a>

          <a
            href="#"
            className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow group"
          >
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                GitHub Repository
              </h4>
              <p className="text-gray-600">
                View source code and contribute to the project
              </p>
            </div>
            <Github className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </a>
        </motion.div>
      </div>
    </div>
  )
}

export default Developers