/**
 * Centralized Authentication Context with localStorage caching
 * Prevents duplicate API calls and caches user data for better UX
 */

import React, { createContext, useEffect, useCallback, useState, useRef } from "react";
import { usePrivy, useIdentityToken, type User } from "@privy-io/react-auth";
import { apiService, type UserInfo, type Subscription, type Developer } from "../services/api";

// Cache keys for localStorage
const CACHE_KEYS = {
  USER_INFO: 'autiv.userInfo',
  SUBSCRIPTIONS: 'autiv.subscriptions',
  DEVELOPER_INFO: 'autiv.developerInfo',
  CACHE_TIMESTAMP: 'autiv.cacheTimestamp'
};

const SMART_ACCOUNT_KEY = 'autiv.smartAccount';

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

const getTimestampKey = (email?: string): string =>
  email ? `${CACHE_KEYS.CACHE_TIMESTAMP}:${email.toLowerCase()}` : CACHE_KEYS.CACHE_TIMESTAMP;

const removeTimestampForEmail = (email?: string): void => {
  if (!email) return;
  localStorage.removeItem(getTimestampKey(email));
};

const getTimestampValue = (expectedEmail?: string): string | null => {
  if (expectedEmail) {
    const scoped = localStorage.getItem(getTimestampKey(expectedEmail));
    if (scoped) return scoped;
  }
  return localStorage.getItem(CACHE_KEYS.CACHE_TIMESTAMP);
};

const clearAllTimestampEntries = (): void => {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i);
    if (storageKey && storageKey.startsWith(`${CACHE_KEYS.CACHE_TIMESTAMP}:`)) {
      keysToRemove.push(storageKey);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
};

// Cache utility functions
type CacheEnvelope<T> = {
  email?: string;
  data: T;
  timestamp?: number;
};

const sanitizeTimestamp = (value?: number | null): number | undefined => {
  if (typeof value !== 'number') return undefined;
  return Number.isNaN(value) ? undefined : value;
};

const normalizeCacheEntry = <T,>(rawValue: string | null, fallbackTimestamp: string | null): {
  data: T | null;
  email?: string;
  timestamp?: number;
} => {
  if (!rawValue) {
    return { data: null };
  }

  try {
    const parsed = JSON.parse(rawValue) as CacheEnvelope<T> | T;
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      const envelope = parsed as CacheEnvelope<T>;
      const normalizedEmail = typeof envelope.email === 'string' ? envelope.email.toLowerCase() : undefined;
      const timestampFromEnvelope = sanitizeTimestamp(envelope.timestamp ?? null);
      const timestampFromFallback = fallbackTimestamp ? sanitizeTimestamp(Number(fallbackTimestamp)) : undefined;
      const timestamp = timestampFromEnvelope ?? timestampFromFallback;

      return {
        data: envelope.data,
        email: normalizedEmail,
        timestamp,
      };
    }

    const legacy = parsed as T & { email?: string };
    const normalizedEmail = typeof legacy?.email === 'string' ? legacy.email.toLowerCase() : undefined;
    const timestampFromFallback = fallbackTimestamp ? sanitizeTimestamp(Number(fallbackTimestamp)) : undefined;

    return {
      data: parsed as T,
      email: normalizedEmail,
      timestamp: timestampFromFallback,
    };
  } catch (error) {
    console.warn('Failed to parse cached entry:', error);
    return { data: null };
  }
};

const hasExpired = (timestamp?: number): boolean => {
  if (!timestamp) return true;
  const age = Date.now() - timestamp;
  return Number.isNaN(age) || age > CACHE_EXPIRATION_MS;
};

const getCachedUserInfo = (expectedEmail?: string): UserInfo | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.USER_INFO);
    const timestampValue = getTimestampValue(expectedEmail);
    const { data, email, timestamp } = normalizeCacheEntry<UserInfo>(raw, timestampValue);

    if (!data) return null;

    const normalizedExpected = expectedEmail?.toLowerCase();
    if (normalizedExpected) {
      const candidateEmail = email ?? (typeof data.email === 'string' ? data.email.toLowerCase() : undefined);
      if (!candidateEmail || candidateEmail !== normalizedExpected) {
        localStorage.removeItem(CACHE_KEYS.USER_INFO);
        if (candidateEmail) {
          removeTimestampForEmail(candidateEmail);
        }
        removeTimestampForEmail(normalizedExpected);
        localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
        return null;
      }
    }

    const fallback = timestampValue ? sanitizeTimestamp(Number(timestampValue)) : undefined;
    const effectiveTimestamp = timestamp ?? fallback;
    if (effectiveTimestamp && hasExpired(effectiveTimestamp)) {
      localStorage.removeItem(CACHE_KEYS.USER_INFO);
      if (email) {
        removeTimestampForEmail(email);
      }
      if (normalizedExpected) {
        removeTimestampForEmail(normalizedExpected);
      }
      localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Failed to get cached user info:', error);
    return null;
  }
};

const getCachedSubscriptions = (expectedEmail?: string): Subscription[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.SUBSCRIPTIONS);
    const timestampValue = getTimestampValue(expectedEmail);
    const { data, email, timestamp } = normalizeCacheEntry<Subscription[]>(raw, timestampValue);

    if (!data) return null;

    if (expectedEmail) {
      const normalizedExpected = expectedEmail.toLowerCase();
      if (!email || email !== normalizedExpected) {
        localStorage.removeItem(CACHE_KEYS.SUBSCRIPTIONS);
        removeTimestampForEmail(email);
        removeTimestampForEmail(normalizedExpected);
        localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
        return null;
      }
    }

    const fallback = timestampValue ? sanitizeTimestamp(Number(timestampValue)) : undefined;
    const effectiveTimestamp = timestamp ?? fallback;
    if (effectiveTimestamp && hasExpired(effectiveTimestamp)) {
      localStorage.removeItem(CACHE_KEYS.SUBSCRIPTIONS);
      removeTimestampForEmail(email);
      if (expectedEmail) {
        removeTimestampForEmail(expectedEmail);
      }
      localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Failed to get cached subscriptions:', error);
    return null;
  }
};

const getCachedDeveloperInfo = (expectedEmail?: string): Developer | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEYS.DEVELOPER_INFO);
    const timestampValue = getTimestampValue(expectedEmail);
    const { data, email, timestamp } = normalizeCacheEntry<Developer>(raw, timestampValue);

    if (!data) return null;

    if (expectedEmail) {
      const normalizedExpected = expectedEmail.toLowerCase();
      if (!email || email !== normalizedExpected) {
        localStorage.removeItem(CACHE_KEYS.DEVELOPER_INFO);
        removeTimestampForEmail(email);
        removeTimestampForEmail(normalizedExpected);
        localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
        return null;
      }
    }

    const fallback = timestampValue ? sanitizeTimestamp(Number(timestampValue)) : undefined;
    const effectiveTimestamp = timestamp ?? fallback;
    if (effectiveTimestamp && hasExpired(effectiveTimestamp)) {
      localStorage.removeItem(CACHE_KEYS.DEVELOPER_INFO);
      removeTimestampForEmail(email);
      if (expectedEmail) {
        removeTimestampForEmail(expectedEmail);
      }
      localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Failed to get cached developer info:', error);
    return null;
  }
};

const setCachedData = (key: string, data: UserInfo | Subscription[] | Developer, email?: string): void => {
  if (!email) return;

  try {
    const timestamp = Date.now();
    const entry: CacheEnvelope<UserInfo | Subscription[] | Developer> = {
      email: email.toLowerCase(),
      data,
      timestamp,
    };

    localStorage.setItem(key, JSON.stringify(entry));
    localStorage.setItem(getTimestampKey(email), timestamp.toString());
    localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
  } catch (error) {
    console.warn(`Failed to cache data for ${key}:`, error);
  }
};

const clearCache = (): void => {
  Object.values(CACHE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  localStorage.removeItem(SMART_ACCOUNT_KEY);
  clearAllTimestampEntries();
};

interface AuthContextType {
  // Privy auth state
  user: User | null;
  authenticated: boolean;
  login: () => void;
  logout: () => void;

  // Database state
  userInfo: UserInfo | null;
  subscriptions: Subscription[];
  developerInfo: Developer | null;
  isDeveloper: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  refreshUserData: () => Promise<void>;
  refreshDeveloperData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authenticated, login, logout: privyLogout, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [developerInfo, setDeveloperInfo] = useState<Developer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const isProcessingRef = useRef(false);
  const lastInitializedEmail = useRef<string | null>(null);

  useEffect(() => {
    apiService.configureAuth(async () => {
      if (!authenticated) return null;
      if (identityToken) return identityToken;
      if (typeof getAccessToken === "function") {
        try {
          const accessToken = await getAccessToken();
          return accessToken ?? null;
        } catch (error) {
          console.error("Failed to obtain Privy access token:", error);
          return null;
        }
      }
      return null;
    });
  }, [identityToken, authenticated, getAccessToken]);

  // Computed property for developer status
  const isDeveloper = developerInfo !== null;

  // Custom logout function that clears cache
  const logout = useCallback(() => {
    console.log("Clearing cache on logout");
    clearCache();
    setUserInfo(null);
    setSubscriptions([]);
    setDeveloperInfo(null);
    setIsInitialized(false);
    lastInitializedEmail.current = null;
    privyLogout();
    apiService.clearAuth();
  }, [privyLogout]);

  // Function to refresh user data after transactions
  const refreshUserData = useCallback(async () => {
    if (!user?.email?.address) return;

    setIsLoading(true);
    try {
      // Reload user subscriptions after transaction
      const subscriptionsResult = await apiService.getUserSubscriptions();
      if (subscriptionsResult.success && subscriptionsResult.data) {
        setSubscriptions(subscriptionsResult.data.subscriptions);
        // Update cache with fresh data
        setCachedData(CACHE_KEYS.SUBSCRIPTIONS, subscriptionsResult.data.subscriptions);
      }
    } catch (error) {
      console.error("Error refreshing user data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.email?.address]);

  // Function to refresh developer data after profile creation
  const refreshDeveloperData = useCallback(async () => {
    if (!user?.email?.address) return;

    try {
      const developerResult = await apiService.getDeveloperInfo();
      if (developerResult.success && developerResult.data?.found && developerResult.data.developer) {
        setDeveloperInfo(developerResult.data.developer);
        setCachedData(CACHE_KEYS.DEVELOPER_INFO, developerResult.data.developer);
      } else {
        setDeveloperInfo(null);
        localStorage.removeItem(CACHE_KEYS.DEVELOPER_INFO);
      }
    } catch (error) {
      console.error("Error refreshing developer data:", error);
    }
  }, [user?.email?.address]);

  // Single useEffect to handle user initialization with proper caching
  useEffect(() => {
    const initializeUser = async () => {
      const currentEmail = user?.email?.address;
      const walletAddress = user?.wallet?.address;
      

      // Reset state when user changes
      if (lastInitializedEmail.current !== currentEmail) {
        setIsInitialized(false);
        setUserInfo(null);
        setSubscriptions([]);
        setDeveloperInfo(null);
        isProcessingRef.current = false;
        lastInitializedEmail.current = null;
      }

      // Skip if conditions aren't met
      if (
        !authenticated ||
        !currentEmail ||
        isLoading ||
        isProcessingRef.current ||
        lastInitializedEmail.current === currentEmail
      ) {
        return;
      }

      // First, try to load from cache
      const cachedUserInfo = getCachedUserInfo(currentEmail);
      const cachedSubscriptions = getCachedSubscriptions(currentEmail);
      const cachedDeveloperInfo = getCachedDeveloperInfo(currentEmail);

      let hasValidCache = false;

      if (cachedUserInfo) {
        // console.log("Loaded user info from cache:", cachedUserInfo);
        setUserInfo(cachedUserInfo);
        hasValidCache = true;
      }

      if (cachedSubscriptions) {
        // console.log("Loaded subscriptions from cache");
        setSubscriptions(cachedSubscriptions);
      }

      if (cachedDeveloperInfo) {
        // console.log("Loaded developer info from cache");
        setDeveloperInfo(cachedDeveloperInfo);
      }

      // If we have valid cached user info and subscriptions, we're done
      if (hasValidCache && cachedSubscriptions) {
        // console.log("All data loaded from cache, skipping API calls");
        setIsInitialized(true);
        lastInitializedEmail.current = currentEmail;
        return;
      }

      // Otherwise, fetch from API
      // console.log("Cache miss or incomplete, fetching from API for:", currentEmail);
      isProcessingRef.current = true;
      setIsLoading(true);

      try {
        // Get smart account from localStorage
        let smartAccountAddress = walletAddress;
        try {
          const storedSmartAccount = localStorage.getItem("autiv.smartAccount");
          if (storedSmartAccount) {
            const smartAccountData = JSON.parse(storedSmartAccount);
            smartAccountAddress = smartAccountData.address;
          }
        } catch {
          console.warn("Could not parse smart account from localStorage");
        }

        // Only fetch user info if not cached
        if (!hasValidCache) {
          const userResult = await apiService.getUserInfo();

          if (
            userResult.success &&
            userResult.data?.found &&
            userResult.data.user
          ) {
            // console.log("User found in database:", userResult.data.user);
            setUserInfo(userResult.data.user);
            setCachedData(CACHE_KEYS.USER_INFO, userResult.data.user, currentEmail);
          } else if (userResult.success && !userResult.data?.found) {
            // console.log("User not found, creating new user...");
            const createResult = await apiService.createUser({
              email: currentEmail,
              wallet_address: walletAddress || "",
              smart_account_address: smartAccountAddress,
            });

            if (createResult.success && createResult.data) {
              // console.log("User created successfully:", createResult.data);
              setUserInfo(createResult.data);
              setCachedData(CACHE_KEYS.USER_INFO, createResult.data, currentEmail);
            } else {
              console.error("Failed to create user:", createResult.error);
            }
          } else {
            console.error("Failed to get user info:", userResult.error);
          }
        }

        // Only fetch subscriptions if not cached
        if (!cachedSubscriptions) {
          const subscriptionsResult = await apiService.getUserSubscriptions();
          if (subscriptionsResult.success && subscriptionsResult.data) {
            setSubscriptions(subscriptionsResult.data.subscriptions);
            setCachedData(CACHE_KEYS.SUBSCRIPTIONS, subscriptionsResult.data.subscriptions, currentEmail);
          }
        }

        // Only fetch developer info if not cached
        if (!cachedDeveloperInfo) {
          // console.log("Fetching developer info from API for:", currentEmail);
          const developerResult = await apiService.getDeveloperInfo();
          if (developerResult.success && developerResult.data?.found && developerResult.data.developer) {
            setDeveloperInfo(developerResult.data.developer);
            setCachedData(CACHE_KEYS.DEVELOPER_INFO, developerResult.data.developer, currentEmail);
          } else {
            setDeveloperInfo(null);
          }
        }

        setIsInitialized(true);
        lastInitializedEmail.current = currentEmail;
        console.log("User initialization completed for:", currentEmail);
      } catch (error) {
        console.error("Error during user initialization:", error);
      } finally {
        isProcessingRef.current = false;
        setIsLoading(false);
      }
    };

    // Only run when authentication state or user email/wallet changes
    if (authenticated && user?.email?.address) {
      initializeUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user?.email?.address, user?.wallet?.address]);

  const value: AuthContextType = {
    // Privy auth state
    user,
    authenticated,
    login,
    logout,

    // Database state
    userInfo,
    subscriptions,
    developerInfo,
    isDeveloper,
    isLoading,
    isInitialized,

    // Actions
    refreshUserData,
    refreshDeveloperData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Export the context for the hook
export { AuthContext };
