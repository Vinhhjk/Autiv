import { motion } from 'framer-motion'
import { FileText, Search, BookOpen, HelpCircle } from 'lucide-react'

const Docs = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-5xl md:text-6xl font-black text-black mb-4">
          <span className="gradient-text">Documentation</span>
        </h1>
        <p className="text-xl text-gray-800 font-medium">
          Learn how to use Autiv effectively
        </p>
      </motion.div>

      {/* Coming Soon Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-12"
        style={{ boxShadow: '8px 8px 0px #000000, 16px 16px 0px #e0e0e0', border: '3px solid #000000' }}
      >
        <div className="text-center mb-12">
          <div
            className="w-24 h-24 flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: '#ff6b6b', border: '3px solid #000000' }}
          >
            <FileText className="w-12 h-12 text-black" />
          </div>
          <h2 className="text-4xl font-black text-black mb-6">
            Documentation Coming Soon
          </h2>
          <p className="text-xl text-gray-800 font-medium mb-8">
            We're creating comprehensive documentation to help you get the most out of Autiv.
          </p>
        </div>

        {/* Feature Preview Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div
            className="p-6 text-center"
            style={{
              backgroundColor: '#f8f9fa',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000'
            }}
          >
            <div
              className="w-16 h-16 flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: '#4ecdc4', border: '2px solid #000000' }}
            >
              <BookOpen className="w-8 h-8 text-black" />
            </div>
            <h3 className="text-xl font-black text-black mb-2">Getting Started</h3>
            <p className="text-gray-700 font-medium">Quick start guides and tutorials</p>
          </div>

          <div
            className="p-6 text-center"
            style={{
              backgroundColor: '#f8f9fa',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000'
            }}
          >
            <div
              className="w-16 h-16 flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: '#feca57', border: '2px solid #000000' }}
            >
              <Search className="w-8 h-8 text-black" />
            </div>
            <h3 className="text-xl font-black text-black mb-2">API Reference</h3>
            <p className="text-gray-700 font-medium">Detailed API endpoint documentation</p>
          </div>

          <div
            className="p-6 text-center"
            style={{
              backgroundColor: '#f8f9fa',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000'
            }}
          >
            <div
              className="w-16 h-16 flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: '#836EF9', border: '2px solid #000000' }}
            >
              <HelpCircle className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-black text-black mb-2">FAQ</h3>
            <p className="text-gray-700 font-medium">Frequently asked questions and troubleshooting</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Docs