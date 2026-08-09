import { useLayoutEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ProfileArchivePosts } from './ProfileArchivePosts';
import type { UseAuthReturn } from '@/hooks/useAuth';

const address = '0x1234567890123456789012345678901234567890';

const authenticatedState = {
  address,
  isConnected: true,
  isConnecting: false,
  isAuthenticated: true,
  isAuthenticating: false,
  isHydrating: false,
  hasHydrated: true,
  session: {
    address,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    selectedCharacter: undefined,
  },
  siweStep: 'complete',
  error: null,
  connect: () => {},
  disconnect: async () => {},
  authenticate: async () => {},
  refreshSession: async () => null,
  clearError: () => {},
} satisfies UseAuthReturn;

function SubmissionFailureHarness() {
  const [isFetchMockReady, setIsFetchMockReady] = useState(false);

  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).includes('/api/lore/submissions')) {
        return new Response(JSON.stringify({ error: 'Archive service unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetch(input, init);
    };
    setIsFetchMockReady(true);

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return isFetchMockReady ? <ProfileArchivePosts auth={authenticatedState} /> : null;
}

const meta: Meta<typeof ProfileArchivePosts> = {
  title: 'Pages/Profile/ProfileArchivePosts',
  component: ProfileArchivePosts,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { auth: authenticatedState },
};

export default meta;
type Story = StoryObj<typeof ProfileArchivePosts>;

export const Authenticated: Story = {};

export const SubmissionFailure: Story = {
  render: () => <SubmissionFailureHarness />,
};
