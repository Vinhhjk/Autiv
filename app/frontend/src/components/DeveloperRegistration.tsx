import { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Building, Globe, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { apiService } from '../services/api'
import { useAuth } from '../hooks/useAuth'

interface DeveloperRegistrationProps {
  onSuccess?: () => void
  onCancel?: () => void
  inline?: boolean // Whether to show inline or as full screen
}

const DeveloperRegistration = ({ onSuccess, onCancel, inline = false }: DeveloperRegistrationProps) => {
  const { user, userInfo } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const [formData, setFormData] = useState({
    display_name: '',
    company_name: '',
    website_url: '',
    logo_url: '',
    description: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.email?.address || !user?.wallet?.address) return

    setIsSubmitting(true)
    setResult(null)

    try {
      // Get smart account from localStorage
      let smartAccountAddress = user.wallet.address
      try {
        const storedSmartAccount = localStorage.getItem("autiv.smartAccount")
        if (storedSmartAccount) {
          const smartAccountData = JSON.parse(storedSmartAccount)
          smartAccountAddress = smartAccountData.address
        }
      } catch {
        console.warn("Could not parse smart account from localStorage")
      }

      const response = await apiService.createDeveloper({
        email: user.email.address,
        wallet_address: user.wallet.address,
        smart_account_address: smartAccountAddress,
        ...formData
      })

      if (response.success) {
        setResult({
          success: true,
          message: 'Developer profile created successfully! You can now create projects.'
        })
        setTimeout(() => {
          onSuccess?.()
        }, 2000)
      } else {
        setResult({
          success: false,
          message: response.error || 'Failed to create developer profile'
        })
      }
    } catch {
      setResult({
        success: false,
        message: 'An error occurred while creating your developer profile'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const containerClass = inline 
    ? "w-full" 
    : "min-h-screen bg-gray-50 flex items-center justify-center p-4"
  
  const formClass = inline 
    ? "w-full p-6" 
    : "w-full max-w-2xl p-8"

  return (
    <div className={containerClass}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={formClass}
        style={{
          backgroundColor: '#ffffff',
          border: '3px solid #000000',
          boxShadow: inline ? '4px 4px 0px #000000' : '6px 6px 0px #000000'
        }}
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-black mb-4">Become a Developer</h1>
          <p className="text-lg text-gray-600">
            Create your developer profile to start building and monetizing projects on Autiv
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-lg font-bold text-black mb-2 flex items-center space-x-2">
                <User size={20} />
                <span>Display Name</span>
              </label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                required
                className="w-full px-4 py-3 text-lg font-medium"
                style={{
                  backgroundColor: '#ffffff',
                  border: '2px solid #000000',
                  boxShadow: '2px 2px 0px #000000'
                }}
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="text-lg font-bold text-black mb-2 flex items-center space-x-2">
                <Building size={20} />
                <span>Company Name</span>
              </label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
                className="w-full px-4 py-3 text-lg font-medium"
                style={{
                  backgroundColor: '#ffffff',
                  border: '2px solid #000000',
                  boxShadow: '2px 2px 0px #000000'
                }}
                placeholder="Awesome Tech Co."
              />
            </div>
          </div>

          <div>
            <label className="text-lg font-bold text-black mb-2 flex items-center space-x-2">
              <Globe size={20} />
              <span>Website URL (Optional)</span>
            </label>
            <input
              type="url"
              value={formData.website_url}
              onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
              className="w-full px-4 py-3 text-lg font-medium"
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
              placeholder="https://yourcompany.com"
            />
          </div>

          <div>
            <label className="block text-lg font-bold text-black mb-2">
              Logo URL (Optional)
            </label>
            <input
              type="url"
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              className="w-full px-4 py-3 text-lg font-medium"
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
              placeholder="https://yourcompany.com/logo.png"
            />
          </div>

          <div>
            <label className="text-lg font-bold text-black mb-2 flex items-center space-x-2">
              <FileText size={20} />
              <span>Description (Optional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 text-lg font-medium resize-none"
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
              placeholder="Tell us about your company and what you plan to build..."
            />
          </div>

          {/* User Info Display */}
          <div className="p-4 bg-gray-100 border-2 border-gray-300 rounded">
            <h3 className="font-bold text-gray-800 mb-2">Account Information</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Email:</strong> {user?.email?.address}</p>
              <p><strong>Wallet:</strong> {user?.wallet?.address}</p>
              {userInfo?.smart_account_address && (
                <p><strong>Smart Account:</strong> {userInfo.smart_account_address}</p>
              )}
            </div>
          </div>

          {/* Result Message */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 flex items-start space-x-3`}
              style={{
                backgroundColor: result.success ? '#d4edda' : '#f8d7da',
                border: '2px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
            >
              {result.success ? (
                <CheckCircle className="text-green-600 mt-1" size={20} />
              ) : (
                <AlertCircle className="text-red-600 mt-1" size={20} />
              )}
              <p className="font-bold text-black">{result.message}</p>
            </motion.div>
          )}

          <div className="flex space-x-4">
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
              whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
              transition={{ duration: 0.1 }}
              className="flex-1 px-6 py-3 font-bold text-lg"
              style={{
                backgroundColor: '#4ecdc4',
                border: '2px solid #000000',
                boxShadow: '2px 2px 0px #000000'
              }}
            >
              {isSubmitting ? 'Creating Profile...' : 'Create Developer Profile'}
            </motion.button>

            {onCancel && (
              <motion.button
                type="button"
                onClick={onCancel}
                whileHover={{ x: 1, y: 1, boxShadow: '1px 1px 0px #000000' }}
                whileTap={{ x: 2, y: 2, boxShadow: 'none' }}
                transition={{ duration: 0.1 }}
                className="px-6 py-3 font-bold text-lg"
                style={{
                  backgroundColor: '#ff6b6b',
                  border: '2px solid #000000',
                  boxShadow: '2px 2px 0px #000000'
                }}
              >
                Cancel
              </motion.button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default DeveloperRegistration
