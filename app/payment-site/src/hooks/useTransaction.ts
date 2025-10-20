import { useContext } from 'react';
import { TransactionContext } from '../context/TransactionContextDefinition';

export function useTransaction() {
  const context = useContext(TransactionContext);
  if (context === undefined) {
    throw new Error('useTransaction must be used within a TransactionProvider');
  }
  return context;
}