import type { Preview } from '@storybook/react';
import React from 'react';
import '../app/globals.css';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, injected } from 'wagmi';
import { mainnet, sepolia } from '@/lib/contracts/chains';
import {
  MOCK_AUTH_STATES,
  MockAuthProvider,
  MockTokenBalancesProvider,
  MockStakingStatusProvider,
  MockCharacterOwnershipProvider,
} from './mock-providers';
import { handlers } from './mocks/handlers';
import { HookMocksProvider } from './mocks/hook-mocks/HookMocksProvider';
import { setupWorker } from 'msw/browser';

// Storybook's Vite transform can preserve classic JSX for Next.js modules.
// Keep React available to those story-only renders without changing app code.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

// Initialize MSW worker for Storybook
const worker = setupWorker(...handlers);

// Start MSW worker in development mode
if (typeof window !== 'undefined') {
  worker.start({
    onUnhandledRequest: 'bypass',
  }).catch((error) => {
    console.error('MSW worker failed to start:', error);
  });
}

// Storybook-specific Wagmi config (with mock/fallback RPC)
const storybookConfig = createConfig({
  chains: [mainnet, sepolia] as any,
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  ssr: true,
  transports: {
    [mainnet.id]: http('https://cloudflare-eth.com'),
    [sepolia.id]: http('https://sepolia.g.alchemy.com/v2/demo'),
  },
});

// Create a query client for Storybook
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Disable retries in Storybook for cleaner output
      retry: false,
      gcTime: 0,
    },
  },
});

// Global decorator to wrap all stories with providers
const withProviders = (Story: React.ComponentType, context: any) => {
  // Check if story has mock state parameter
  const mockState = context.parameters?.mockState || context.globals?.mockState || 'connected';
  const authState = {
    ...(MOCK_AUTH_STATES[mockState] || MOCK_AUTH_STATES.connected),
    ...(context.parameters?.authState || {}),
  };
  const hookMocks = context.parameters?.hookMocks;
  const isFullscreen = context.parameters?.layout === 'fullscreen';

  return (
    <HookMocksProvider mocks={hookMocks}>
      <WagmiProvider config={storybookConfig}>
        <QueryClientProvider client={queryClient}>
          <MockAuthProvider state={authState}>
            <MockTokenBalancesProvider>
              <MockStakingStatusProvider>
                <MockCharacterOwnershipProvider>
                  <div style={{ padding: isFullscreen ? 0 : '1rem', minHeight: '100vh' }}>
                    <Story />
                  </div>
                </MockCharacterOwnershipProvider>
              </MockStakingStatusProvider>
            </MockTokenBalancesProvider>
          </MockAuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </HookMocksProvider>
  );
};

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    docs: {
      toc: true,
    },
    // Add support for bigint in Storybook controls
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1a1a1a' },
        { name: 'light', value: '#ffffff' },
      ],
    },
  },
  decorators: [withProviders],
  globalTypes: {
    mockState: {
      description: 'Global mock state for components',
      defaultValue: 'connected',
      toolbar: {
        title: 'Mock State',
        icon: 'gear',
        items: [
          { value: 'connected', title: 'Connected' },
          { value: 'connecting', title: 'Connecting' },
          { value: 'disconnected', title: 'Disconnected' },
          { value: 'loading', title: 'Hydrating' },
          { value: 'authenticating', title: 'Authenticating' },
          { value: 'signatureRejected', title: 'Signature rejected' },
          { value: 'admin', title: 'Admin' },
          { value: 'error', title: 'Error' },
        ],
      },
    },
  },
};

export default preview;
