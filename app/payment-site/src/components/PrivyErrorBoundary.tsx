import React, { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class PrivyErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's a hydration error from Privy
    if (error.message.includes('validateDOMNesting') || 
        error.message.includes('cannot be a descendant of') ||
        error.message.includes('cannot contain a nested')) {
      // Suppress Privy hydration errors
      console.warn('Privy hydration warning suppressed:', error.message);
      return { hasError: false };
    }
    
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error but don't crash the app for Privy hydration issues
    if (error.message.includes('validateDOMNesting') || 
        error.message.includes('cannot be a descendant of') ||
        error.message.includes('cannot contain a nested')) {
      console.warn('Privy hydration warning suppressed:', error.message);
      return;
    }
    
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-4">Please refresh the page to try again.</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PrivyErrorBoundary;
