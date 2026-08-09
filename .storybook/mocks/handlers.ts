/**
 * MSW Handlers for Storybook
 * Mock API responses for isolated component testing
 */

import { http, HttpResponse } from 'msw';

// Auth endpoints
export const authHandlers = [
  http.get('/api/auth/nonce', () => {
    return HttpResponse.json({ nonce: 'mock-nonce-12345' });
  }),

  http.post('/api/auth/verify', () => {
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      address: '0x1234567890123456789012345678901234567890',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      selectedCharacter: null,
    });
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true });
  }),
];

// Character endpoints
export const characterHandlers = [
  http.get('/api/character/:tokenId', ({ params }) => {
    return HttpResponse.json({
      token_id: params.tokenId,
      name: 'Zombie King',
      class: 'Undead',
      level: 45,
      experience: 10000n,
      str: 18,
      dex: 16,
      con: 20,
      int: 12,
      wis: 14,
      cha: 10,
      hp: 150,
      max_hp: 150,
      ac: 16,
      speed: 30,
      owner_address: '0x1234567890123456789012345678901234567890',
      infection_status: 'healthy' as const,
      staking_status: 'unstaked' as const,
    });
  }),

  http.get('/api/character/:tokenId/ownership', () => {
    return HttpResponse.json({ isOwner: true });
  }),
];

// Staking endpoints
export const stakingHandlers = [
  http.get('/api/staking/:tokenId/status', () => {
    return HttpResponse.json({ isStaked: false, stakedAtLocation: null });
  }),
];

// Searing endpoints
export const searingHandlers = [
  http.get('/api/concords/searing-map', () => {
    return HttpResponse.json({
      searingMap: [
        {
          token_name: 'Cauldron of Detriti',
          location: 'body',
          new_trait: 'detriti cauldron',
          makesBald: false,
          tokenId: '1',
          concordTokenId: 1,
        },
      ],
      total: 1,
      count: 1,
      limit: 2000,
      offset: 0,
    });
  }),

  http.post('/api/characters/:tokenId/searing/sync', ({ params }) => {
    return HttpResponse.json({
      transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      results: [
        {
          eventId: 'storybook-searing-event',
          tokenId: Number(params.tokenId),
          concordId: 1,
          transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
          status: 'completed',
          imageUrl: '/images/characters/storybook-seared.png',
        },
      ],
    });
  }),
];

// Lore submission endpoints
export const loreSubmissionHandlers = [
  http.get('/api/lore/submissions', () => {
    return HttpResponse.json({
      success: true,
      data: {
        submissions: [
          {
            id: 'storybook-submission-1',
            tokenId: '101',
            title: 'The Bell Beneath the Ash',
            summary: 'A signed-wallet chronicle preserved for profile state review.',
            status: 'public',
            visibility: 'public',
            publishedSlug: 'the-bell-beneath-the-ash',
            submittedAt: '2026-07-12T12:00:00.000Z',
            updatedAt: '2026-07-13T12:00:00.000Z',
          },
        ],
      },
    });
  }),
];

// Balance endpoints
export const balanceHandlers = [
  http.get('/api/balances/:address', () => {
    return HttpResponse.json([
      { symbol: 'ETH', balance: '1.5', address: '0x0000000000000000000000000000000000000000' },
      { symbol: 'WAGDIE', balance: '10000', address: '0x1234567890123456789012345678901234567890' },
    ]);
  }),
];

// Combined handlers
export const handlers = [
  ...authHandlers,
  ...characterHandlers,
  ...stakingHandlers,
  ...searingHandlers,
  ...loreSubmissionHandlers,
  ...balanceHandlers,
];
