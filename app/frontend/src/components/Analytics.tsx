import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Users, DollarSign } from 'lucide-react'

const Analytics = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-5xl md:text-6xl font-black text-black mb-4">
          <span className="gradient-text">Analytics</span>
        </h1>
        <p className="text-xl text-gray-800 font-medium">
          Track your subscription usage and insights
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
            style={{ backgroundColor: '#4ecdc4', border: '3px solid #000000' }}
          >
            <BarChart3 className="w-12 h-12 text-black" />
          </div>
          <h2 className="text-4xl font-black text-black mb-6">
            Analytics Dashboard Coming Soon
          </h2>
          <p className="text-xl text-gray-800 font-medium mb-8">
            We're building comprehensive analytics to help you understand your subscription usage.
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
              style={{ backgroundColor: '#feca57', border: '2px solid #000000' }}
            >
              <TrendingUp className="w-8 h-8 text-black" />
            </div>
            <h3 className="text-xl font-black text-black mb-2">Usage Trends</h3>
            <p className="text-gray-700 font-medium">Track your API usage over time</p>
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
              style={{ backgroundColor: '#ff6b6b', border: '2px solid #000000' }}
            >
              <Users className="w-8 h-8 text-black" />
            </div>
            <h3 className="text-xl font-black text-black mb-2">User Metrics</h3>
            <p className="text-gray-700 font-medium">Monitor user engagement and activity</p>
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
              <DollarSign className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-black text-black mb-2">Cost Analysis</h3>
            <p className="text-gray-700 font-medium">Understand your subscription costs</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Analytics