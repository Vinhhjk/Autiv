// Utility to suppress Privy hydration warnings in development
export const suppressPrivyWarnings = () => {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    console.error = (...args: unknown[]) => {
      const message = args.join(' ');
      
      // Suppress specific Privy hydration warnings
      if (
        message.includes('validateDOMNesting') ||
        message.includes('cannot be a descendant of') ||
        message.includes('cannot contain a nested') ||
        message.includes('HelpTextContainer') ||
        message.includes('Privy')
      ) {
        // Suppress these warnings
        return;
      }
      
      originalConsoleError.apply(console, args);
    };
    
    console.warn = (...args: unknown[]) => {
      const message = args.join(' ');
      
      // Suppress specific Privy hydration warnings
      if (
        message.includes('validateDOMNesting') ||
        message.includes('cannot be a descendant of') ||
        message.includes('cannot contain a nested') ||
        message.includes('HelpTextContainer') ||
        message.includes('Privy')
      ) {
        // Suppress these warnings
        return;
      }
      
      originalConsoleWarn.apply(console, args);
    };
  }
};
