import { createContext } from "react";

export interface TransactionStatus {
  isActive: boolean;
  type:
    | "approval"
    | "vote"
    | "proposal"
    | "execution"
    | "updateExecutionHash"
    | "unlock"
    | "claimTestTokens"
    | "admin"
    | "dao-creation"
    | "upgrade-admin-count"
    | "upgrade-actions-per-proposal"
    | "cancel"
    | null;
  status: "pending" | "confirming" | "success" | "error" | null;
  message: string;
  txHash?: string;
}

export interface TransactionContextType {
  transaction: TransactionStatus;
  setTransaction: (transaction: Partial<TransactionStatus>) => void;
  resetTransaction: () => void;
  startTransaction: (type: TransactionStatus["type"], message: string) => void;
  updateTransaction: (updates: Partial<TransactionStatus>) => void;
}

export const TransactionContext = createContext<
  TransactionContextType | undefined
>(undefined);
