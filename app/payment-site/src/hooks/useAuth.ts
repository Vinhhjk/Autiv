/**
 * Authentication Hook - Uses centralized AuthContext
 * This prevents duplicate API calls by sharing state across components
 */

import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
