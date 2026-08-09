import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
import { ProfilePageClient } from './ProfilePageClient';

const address = '0x1234567890123456789012345678901234567890' as const;
const changedAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const;
const contractAddress = '0x1111111111111111111111111111111111111111' as const;
const refetch = async () => ({} as never);
const characters = [
  {
    token_id: 5,
    name: 'Astaroth The Horned Devil',
    owner_address: address,
    staker_address: null,
    image_url: '/images/characters/5.png',
    metadata: { currentImage: { url: '/images/characters/5.png', kind: 'base' } },
  },
  {
    token_id: 6036,
    name: 'Agorn Umbrellatop',
    owner_address: '0x9999999999999999999999999999999999999999',
    staker_address: address,
    image_url: '/images/characters/6036.png',
    metadata: { currentImage: { url: '/images/characters/6036.png', kind: 'base' } },
    staking_status: 'staked' as const,
  },
  {
    token_id: 5218,
    name: 'Axan the Berserker',
    owner_address: address,
    staker_address: null,
    image_url: '/images/characters/5218.png',
    metadata: { currentImage: { url: '/images/characters/5218.png', kind: 'base' } },
  },
  {
    token_id: 2890,
    name: 'Eldrin The Minor',
    owner_address: address,
    staker_address: null,
    image_url: '/images/characters/2890.png',
    metadata: { currentImage: { url: '/images/characters/2890.png', kind: 'base' } },
  },
  {
    token_id: 4203,
    name: 'Kelisya of The Veil',
    owner_address: address,
    staker_address: null,
    image_url: '/images/characters/4203.png',
    metadata: { currentImage: { url: '/images/characters/4203.png', kind: 'base' } },
  },
  {
    token_id: 5671,
    name: 'Glepherin the Lost Prince',
    owner_address: address,
    staker_address: null,
    image_url: '/images/characters/5671.png',
    metadata: { currentImage: { url: '/images/characters/5671.png', kind: 'base' } },
  },
];
const characterHook = {
  characters,
  totalCount: 6,
  totalPages: 1,
  currentPage: 1,
  hasMore: false,
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  refetch,
};
const tokenHook = {
  balances: {
    concord: { tokenId: 1n, balance: 8n, contractAddress, tokenType: 'ERC1155' as const },
    corpse: { tokenId: 1n, balance: 2n, contractAddress, tokenType: 'ERC1155' as const },
    mushroom: { tokenId: 1n, balance: 0n, contractAddress, tokenType: 'ERC1155' as const },
  },
  isLoading: false,
  error: null,
  refetch: async () => {},
};
const searingMap = {
  token_name: 'Cauldron of Detriti',
  location: 'Body',
  new_trait: 'Detriti Cauldron',
  makesBald: false,
  tokenId: '1',
  concordTokenId: 1,
};
const searingHook = {
  concords: [{
    concordId: 1,
    tokenId: '1',
    name: searingMap.token_name,
    location: searingMap.location,
    newTrait: searingMap.new_trait,
    makesBald: false,
    amount: 3n,
    imageUrl: 'https://storage.googleapis.com/concord-images/1.gif',
    map: searingMap,
    balance: {
      concordId: 1,
      tokenId: 1n,
      balance: 3n,
      isOwned: true,
      contractAddress,
    },
  }],
  allSearableConcords: [searingMap],
  isLoading: false,
  error: null,
  refetch: async () => {},
};

const meta: Meta<typeof ProfilePageClient> = {
  title: 'Pages/Profile/ProfilePageClient',
  component: ProfilePageClient,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    mockState: 'connected',
    hookMocks: {
      useCharacters: characterHook,
      useTokenBalances: tokenHook,
      useSearingConcords: searingHook,
    },
  },
};

export default meta;
type Story = StoryObj<typeof ProfilePageClient>;

export const Authenticated: Story = {};

export const SearableConcordSubsetExpanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', {
      name: 'Searable Concords — subset of your Concord balance',
    });
    await userEvent.click(trigger);
    await expect(canvas.getByText('Cauldron of Detriti')).toBeInTheDocument();
  },
};

export const Disconnected: Story = {
  parameters: { mockState: 'disconnected' },
};

export const Connecting: Story = {
  parameters: { mockState: 'connecting' },
};

export const Hydrating: Story = {
  parameters: { mockState: 'loading' },
};

export const Authenticating: Story = {
  parameters: { mockState: 'authenticating' },
};

export const SignatureRejected: Story = {
  parameters: { mockState: 'signatureRejected' },
};

export const TokenFailureKeepsOtherSections: Story = {
  parameters: {
    hookMocks: {
      useCharacters: characterHook,
      useTokenBalances: {
        ...tokenHook,
        balances: { concord: null, corpse: null, mushroom: null },
        error: { message: 'Mock RPC unavailable', type: 'rpc_error' },
      },
      useSearingConcords: searingHook,
    },
  },
};

export const CharacterFailureKeepsTokensAndPosts: Story = {
  parameters: {
    hookMocks: {
      useCharacters: {
        ...characterHook,
        characters: [],
        isError: true,
        error: new Error('Mock character index unavailable'),
      },
      useTokenBalances: tokenHook,
      useSearingConcords: searingHook,
    },
  },
};

export const PaginatedCharacters: Story = {
  parameters: {
    hookMocks: {
      useCharacters: {
        ...characterHook,
        totalCount: 26,
        totalPages: 3,
        hasMore: true,
      },
      useTokenBalances: tokenHook,
      useSearingConcords: searingHook,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Next' }));
    await expect(canvas.getByText('Page 2 of 3')).toBeInTheDocument();
  },
};

export const WalletChanged: Story = {
  parameters: {
    authState: {
      address: changedAddress,
      session: {
        address: changedAddress,
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        selectedCharacter: undefined,
      },
    },
    hookMocks: {
      useCharacters: {
        ...characterHook,
        characters: [{
          token_id: 303,
          name: 'Changed Wallet Pilgrim',
          owner_address: changedAddress,
          staker_address: null,
          image_url: '/images/characters/app/current/303.png',
        }],
        totalCount: 1,
        totalPages: 1,
        hasMore: false,
      },
      useTokenBalances: tokenHook,
      useSearingConcords: searingHook,
    },
  },
};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
