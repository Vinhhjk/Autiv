import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, AlertCircle } from 'lucide-react'

interface ToastProps {
  isVisible: boolean
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
}

const Toast = ({ isVisible, message, type, onClose }: ToastProps) => {
  const getIcon = () => {
    switch (type) {
      case 'success': return <Check className="w-5 h-5 text-green-600" />
      case 'error': return <X className="w-5 h-5 text-red-600" />
      case 'info': return <AlertCircle className="w-5 h-5 text-blue-600" />
    }
  }

  const getColors = () => {
    switch (type) {
      case 'success': return 'bg-green-50 border-green-200 text-green-800'
      case 'error': return 'bg-red-50 border-red-200 text-red-800'
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-800'
    }
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="fixed top-4 right-4 z-50"
        >
          <div className={`flex items-center space-x-3 px-4 py-3 rounded-2xl border shadow-lg ${getColors()}`}>
            {getIcon()}
            <span className="font-medium">{message}</span>
            <button
              onClick={onClose}
              className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default Toast