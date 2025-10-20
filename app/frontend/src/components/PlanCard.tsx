import { motion } from 'framer-motion'
import { Check, Zap, Crown, Rocket } from 'lucide-react'

interface Plan {
  id: string
  name: string
  price: string
  token: string
  description: string
  features: string[]
}

interface PlanCardProps {
  plan: Plan
  onSubscribe: () => void
}

const PlanCard = ({ plan, onSubscribe }: PlanCardProps) => {
  const getIcon = () => {
    switch (plan.id) {
      case 'basic': return <Zap className="w-12 h-12 text-black" />
      case 'pro': return <Crown className="w-12 h-12 text-black" />
      case 'enterprise': return <Rocket className="w-12 h-12 text-black" />
      default: return <Zap className="w-12 h-12 text-black" />
    }
  }

  const getBgColor = () => {
    switch (plan.id) {
      case 'basic': return '#4ecdc4'  // Retro cyan
      case 'pro': return '#feca57'    // Yellow for popular plan
      case 'enterprise': return '#836EF9'  // Monad Purple for premium only
      default: return '#45b7d1'
    }
  }

  const getShadowColors = () => {
    return ['#000000', '#e0e0e0'] // Simple black and gray shadows
  }

  const isPopular = plan.id === 'pro'
  const shadowColors = getShadowColors()

  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3 }}
      className="relative group"
    >
      {/* Popular Badge */}
      {isPopular && (
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 z-20">
          <div
            className="text-black px-4 py-2 font-black"
            style={{ backgroundColor: '#feca57', border: '2px solid #000000' }}
          >
            MOST POPULAR
          </div>
        </div>
      )}

      <div
        className="p-8 h-full transition-all duration-300 hover:shadow-lg"
        style={{
          backgroundColor: '#ffffff',
          border: '3px solid #000000',
          boxShadow: `4px 4px 0px ${shadowColors[0]}, 8px 8px 0px ${shadowColors[1]}`
        }}
      >
        {/* Token Logo */}
        <div className="relative mb-6">
          <div
            className="w-24 h-24 flex items-center justify-center"
            style={{ backgroundColor: getBgColor(), border: '3px solid #000000' }}
          >
            {getIcon()}
          </div>
        </div>

        {/* Plan Details */}
        <h3 className="text-4xl font-black text-black mb-4">
          {plan.name}
        </h3>
        <p className="text-gray-700 mb-8 text-xl font-medium">{plan.description}</p>

        {/* Price */}
        <div className="mb-8">
          <div className="flex items-baseline">
            <span className="text-6xl font-black text-black">{plan.price}</span>
            <span className="text-3xl text-black ml-3 font-bold">{plan.token}</span>
            <span className="text-gray-600 ml-3 text-xl font-bold">/minutes</span>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-4 mb-8">
          {plan.features.map((feature, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center"
            >
              <div
                className="w-10 h-10 flex items-center justify-center mr-4 flex-shrink-0"
                style={{ backgroundColor: '#96ceb4', border: '2px solid #000000' }}
              >
                <Check className="w-6 h-6 text-black" />
              </div>
              <span className="text-gray-800 font-medium text-lg">{feature}</span>
            </motion.li>
          ))}
        </ul>

        {/* Subscribe Button */}
        <button
          onClick={onSubscribe}
          className="retro-button w-full py-5 font-black text-xl"
        >
          Subscribe with Autiv!
        </button>
      </div>
    </motion.div>
  )
}

export default PlanCard