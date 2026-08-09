/**
 * Mock Providers for Storybook
 * Provides isolated mock data for complex hooks in Storybook context
 */

import React, { createContext, useContext, ReactNode } from 'react';
import type { UseAuthReturn } from '../hooks/useAuth';

// ============================================================================
// Mock Contexts
// ============================================================================

export type MockAuthValue = UseAuthReturn;

const DEFAULT_ADDRESS = '0x1234567890123456789012345678901234567890';
const defaultSession = {
  address: DEFAULT_ADDRESS,
  expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  selectedCharacter: undefined,
};

const defaultAuthValue: MockAuthValue = {
  address: DEFAULT_ADDRESS,
  isConnected: true,
  isConnecting: false,
  isAuthenticated: true,
  isAuthenticating: false,
  isHydrating: false,
  hasHydrated: true,
  session: defaultSession,
  siweStep: 'complete',
  error: null,
  connect: () => {},
  disconnect: async () => {},
  authenticate: async () => {},
  refreshSession: async () => defaultSession,
  clearError: () => {},
};

export const MOCK_AUTH_STATES = {
  connected: {},
  connecting: {
    address: undefined,
    isConnected: false,
    isConnecting: true,
    isAuthenticated: false,
    session: null,
    siweStep: 'idle',
  },
  disconnected: {
    address: undefined,
    isConnected: false,
    isAuthenticated: false,
    session: null,
    siweStep: 'idle',
  },
  loading: {
    isAuthenticated: false,
    isHydrating: true,
    hasHydrated: false,
    session: null,
    siweStep: 'idle',
  },
  authenticating: {
    isAuthenticated: false,
    isAuthenticating: true,
    session: null,
    siweStep: 'signing',
  },
  signatureRejected: {
    isAuthenticated: false,
    session: null,
    siweStep: 'error',
    error: { message: 'Wallet signature was rejected.' },
  },
  admin: {
    address: '0x5a7F5938deA6238137043415e28efd99A6532dD3',
    session: {
      address: '0x5a7F5938deA6238137043415e28efd99A6532dD3',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      selectedCharacter: undefined,
    },
  },
  error: {
    isAuthenticated: false,
    session: null,
    siweStep: 'error',
    error: { message: 'Mock wallet error.' },
  },
} satisfies Record<string, Partial<MockAuthValue>>;

/** Mock Auth Context used by the Storybook `@/hooks/useAuth` alias. */
const MockAuthContext = createContext<MockAuthValue>(defaultAuthValue);

/**
 * Mock Character Ownership Context
 */
const MockCharacterOwnershipContext = createContext({
  isOwner: true,
  isLoading: false,
  error: null,
});

/**
 * Mock Token Balances Context
 */
const MockTokenBalancesContext = createContext({
  balances: [
    { symbol: 'ETH', balance: '1.5', address: '0x0000000000000000000000000000000000000000' },
    { symbol: 'WAGDIE', balance: '10000', address: '0x1234567890123456789012345678901234567890' },
  ],
  isLoading: false,
  error: null,
});

/**
 * Mock Staking Status Context
 */
const MockStakingStatusContext = createContext({
  isStaked: false,
  stakedAtLocation: null,
  isLoading: false,
  error: null,
});

// ============================================================================
// Mock Providers
// ============================================================================

/**
 * Mock Auth Provider
 * For components using useAuth hook
 */
export const MockAuthProvider = ({
  children,
  state,
}: {
  children: ReactNode;
  state?: Partial<MockAuthValue>;
}) => {
  return (
    <MockAuthContext.Provider value={{ ...defaultAuthValue, ...state }}>
      {children}
    </MockAuthContext.Provider>
  );
};

/**
 * Mock Character Ownership Provider
 * For components checking character ownership
 */
export const MockCharacterOwnershipProvider = ({
  children,
  isOwner = true,
  isLoading = false,
  error = null,
}: {
  children: ReactNode;
  isOwner?: boolean;
  isLoading?: boolean;
  error?: any;
}) => {
  return (
    <MockCharacterOwnershipContext.Provider
      value={{
        isOwner,
        isLoading,
        error,
      }}
    >
      {children}
    </MockCharacterOwnershipContext.Provider>
  );
};

/**
 * Mock Token Balances Provider
 * For wallet components showing token balances
 */
export const MockTokenBalancesProvider = ({
  children,
  balances = [
    { symbol: 'ETH', balance: '1.5', address: '0x0000000000000000000000000000000000000000' },
    { symbol: 'WAGDIE', balance: '10000', address: '0x1234567890123456789012345678901234567890' },
  ],
  isLoading = false,
  error = null,
}: {
  children: ReactNode;
  balances?: Array<{ symbol: string; balance: string; address: string }>;
  isLoading?: boolean;
  error?: any;
}) => {
  return (
    <MockTokenBalancesContext.Provider
      value={{
        balances,
        isLoading,
        error,
      }}
    >
      {children}
    </MockTokenBalancesContext.Provider>
  );
};

/**
 * Mock Staking Status Provider
 * For staking-related components
 */
export const MockStakingStatusProvider = ({
  children,
  isStaked = false,
  stakedAtLocation = null,
  isLoading = false,
  error = null,
}: {
  children: ReactNode;
  isStaked?: boolean;
  stakedAtLocation?: string | null;
  isLoading?: boolean;
  error?: any;
}) => {
  return (
    <MockStakingStatusContext.Provider
      value={{
        isStaked,
        stakedAtLocation,
        isLoading,
        error,
      }}
    >
      {children}
    </MockStakingStatusContext.Provider>
  );
};

// ============================================================================
// Mock Hook Wrappers
// ============================================================================

/**
 * Mock useAuth hook for Storybook
 */
export const useAuth = (): MockAuthValue => useContext(MockAuthContext);

/**
 * Mock useCharacterOwnership hook for Storybook
 */
export const useCharacterOwnership = (tokenId: number | null) => {
  const context = useContext(MockCharacterOwnershipContext);
  return {
    isOwner: context.isOwner,
    isLoading: context.isLoading,
    error: context.error,
  };
};

/**
 * Mock useTokenBalances hook for Storybook
 */
export const useTokenBalances = (address: string) => {
  const context = useContext(MockTokenBalancesContext);
  return {
    balances: context.balances,
    isLoading: context.isLoading,
    error: context.error,
  };
};

/**
 * Mock useStakingStatus hook for Storybook
 */
export const useStakingStatus = (tokenId: number | null) => {
  const context = useContext(MockStakingStatusContext);
  return {
    isStaked: context.isStaked,
    stakedAtLocation: context.stakedAtLocation,
    isLoading: context.isLoading,
    error: context.error,
  };
};

// ============================================================================
// Mock Services
// ============================================================================

/**
 * Mock BalancesService
 */
export class MockBalancesService {
  async getAllBalances(address: string) {
    return [
      { symbol: 'ETH', balance: '1.5', address: '0x0000000000000000000000000000000000000000' },
      { symbol: 'WAGDIE', balance: '10000', address: '0x1234567890123456789012345678901234567890' },
    ];
  }
}

/**
 * Mock StakingService
 */
export class MockStakingService {
  async getStakingStatus(tokenId: number) {
    return {
      isStaked: false,
      stakedAtLocation: null,
    };
  }
}

/**
 * Mock OwnershipService
 */
export class MockOwnershipService {
  async checkOwnership(tokenId: number, address: string) {
    return {
      isOwner: true,
    };
  }
}
