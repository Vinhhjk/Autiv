import { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, AlertCircle } from 'lucide-react'

interface ToastProps {
  isVisible: boolean
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
  actionLabel?: string
  actionHref?: string
}

const Toast = ({ isVisible, message, type, onClose, actionLabel, actionHref }: ToastProps) => {
  const { accentColor, iconColor } = useMemo(() => {
    switch (type) {
      case 'success':
        return { accentColor: '#4ecdc4', iconColor: 'text-green-600' }
      case 'error':
        return { accentColor: '#ff6b6b', iconColor: 'text-red-600' }
      case 'info':
      default:
        return { accentColor: '#836EF9', iconColor: 'text-blue-600' }
    }
  }, [type])

  const Icon = useMemo(() => {
    switch (type) {
      case 'success':
        return <Check className={`w-6 h-6 ${iconColor}`} />
      case 'error':
        return <X className={`w-6 h-6 ${iconColor}`} />
      case 'info':
      default:
        return <AlertCircle className={`w-6 h-6 ${iconColor}`} />
    }
  }, [type, iconColor])

  useEffect(() => {
    if (!isVisible) return

    const timer = window.setTimeout(() => {
      onClose()
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isVisible, onClose])

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
          <div
            className="relative flex items-start space-x-4 px-5 py-4 pr-10 rounded-none"
            style={{
              border: '4px solid #000000',
              boxShadow: '6px 6px 0px #000000, 10px 10px 0px #f8f8f8',
              backgroundColor: '#ffffff',
              minWidth: '260px'
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-2"
              style={{ backgroundColor: accentColor }}
            />
            <div className="mt-1">
              {Icon}
            </div>
            <div className="flex flex-col">
              <span className="font-black text-base text-black">{message}</span>
              {actionHref && actionLabel && (
                <a
                  href={actionHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center text-xs font-black uppercase tracking-wide underline"
                >
                  {actionLabel}
                </a>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-2 text-gray-500 hover:text-black transition-colors"
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