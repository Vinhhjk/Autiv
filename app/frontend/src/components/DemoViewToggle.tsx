interface DemoViewToggleProps {
  activeView: 'plans' | 'dashboard'
  onViewChange: (view: 'plans' | 'dashboard') => void
}

const DemoViewToggle = ({ activeView, onViewChange }: DemoViewToggleProps) => {
  return (
    <div className="mb-8 flex justify-center">
      <div
        className="inline-flex p-2"
        style={{
          backgroundColor: '#ffffff',
          border: '3px solid #000000',
          boxShadow: '4px 4px 0px #000000'
        }}
      >
        <button
          onClick={() => onViewChange('plans')}
          className={`
            px-6 py-3 font-black text-lg transition-all duration-200
            ${activeView === 'plans' ? 'retro-button' : 'hover:bg-gray-100'}
          `}
          style={{
            backgroundColor: activeView === 'plans' ? '#4ecdc4' : 'transparent',
            border: activeView === 'plans' ? '2px solid #000000' : 'none',
            boxShadow: activeView === 'plans' ? '2px 2px 0px #000000' : 'none'
          }}
        >
          Subscription Plans
        </button>
        <button
          onClick={() => onViewChange('dashboard')}
          className={`
            px-6 py-3 font-black text-lg transition-all duration-200 ml-2
            ${activeView === 'dashboard' ? 'retro-button' : 'hover:bg-gray-100'}
          `}
          style={{
            backgroundColor: activeView === 'dashboard' ? '#feca57' : 'transparent',
            border: activeView === 'dashboard' ? '2px solid #000000' : 'none',
            boxShadow: activeView === 'dashboard' ? '2px 2px 0px #000000' : 'none'
          }}
        >
          Demo Dashboard
        </button>
      </div>
    </div>
  )
}

export default DemoViewToggle