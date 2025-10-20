import { useState } from 'react';
import type { ReactNode } from 'react';
import { TransactionContext } from './TransactionContextDefinition';
import type { TransactionStatus } from './TransactionContextDefinition';

const initialTransaction: TransactionStatus = {
  isActive: false,
  type: null,
  status: null,
  message: '',
  txHash: undefined,
};

export function TransactionProvider({ children }: { children: ReactNode }) {
  const [transaction, setTransactionState] = useState<TransactionStatus>(initialTransaction);

  const setTransaction = (updates: Partial<TransactionStatus>) => {
    setTransactionState(prev => ({ ...prev, ...updates }));
  };

  const resetTransaction = () => {
    setTransactionState(initialTransaction);
  };

  const startTransaction = (type: TransactionStatus['type'], message: string) => {
    setTransactionState({
      isActive: true,
      type,
      status: 'pending',
      message,
      txHash: undefined,
    });
  };

  const updateTransaction = (updates: Partial<TransactionStatus>) => {
    setTransactionState(prev => ({
      ...prev,
      ...updates,
    }));
  };

  return (
    <TransactionContext.Provider value={{
      transaction,
      setTransaction,
      resetTransaction,
      startTransaction,
      updateTransaction,
    }}>
      {children}
    </TransactionContext.Provider>
  );
}


