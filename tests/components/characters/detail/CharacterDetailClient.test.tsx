import { render, waitFor } from '@testing-library/react'
import { CharacterDetailClient } from '@/app/characters/[tokenId]/CharacterDetailClient'
import type { EffectiveTokenCharacterLore } from '@/lib/lore/types'

const mockPush = jest.fn()
const mockBack = jest.fn()
const mockUseAccount = jest.fn()
let mockSearchParams = new URLSearchParams()

const mockCharacterSheetLayout = jest.fn(() => <div data-testid="character-sheet-layout" />)
const mockCharacterHeader = jest.fn(() => <div data-testid="character-header" />)
const mockCharacterModals = jest.fn(() => <div data-testid="character-modals" />)

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useSearchParams: () => mockSearchParams,
}))

jest.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
}))

jest.mock('@/components/characters/detail', () => ({
  CharacterHeader: (props: unknown) => mockCharacterHeader(props),
  CharacterModals: (props: unknown) => mockCharacterModals(props),
  CharacterSheetLayout: (props: unknown) => mockCharacterSheetLayout(props),
}))

jest.mock('@/hooks/useCharacterDetailData', () => ({
  useCharacterDetailData: jest.fn(),
}))

jest.mock('@/hooks/useCharacterEditor', () => ({
  useCharacterEditor: jest.fn(),
}))

jest.mock('@/hooks/useCharacterSave', () => ({
  useCharacterSave: jest.fn(),
}))

jest.mock('@/hooks/useCharacterImageDisplay', () => ({
  useCharacterImageDisplay: jest.fn(),
}))

jest.mock('@/hooks/useCharacterEditGuards', () => ({
  useCharacterEditGuards: jest.fn(),
}))

jest.mock('@/hooks/useAICharacter', () => ({
  useAICharacter: jest.fn(),
}))

jest.mock('@/contexts/ChatDockContext', () => ({
  useChatDock: () => ({ openChat: jest.fn() }),
}))

const { useCharacterDetailData } = jest.requireMock('@/hooks/useCharacterDetailData') as { useCharacterDetailData: jest.Mock }
const { useCharacterEditor } = jest.requireMock('@/hooks/useCharacterEditor') as { useCharacterEditor: jest.Mock }
const { useCharacterSave } = jest.requireMock('@/hooks/useCharacterSave') as { useCharacterSave: jest.Mock }
const { useCharacterImageDisplay } = jest.requireMock('@/hooks/useCharacterImageDisplay') as { useCharacterImageDisplay: jest.Mock }
const { useAICharacter } = jest.requireMock('@/hooks/useAICharacter') as { useAICharacter: jest.Mock }

const adminAddress = '0x5a7F5938deA6238137043415e28efd99A6532dD3'

const character = {
  id: 123,
  name: 'Playable Character',
  metadata: {},
  owner_address: '0xOwner',
  staker_address: null,
  infection_status: 'healthy',
  staking_status: null,
}

const editor = {
  state: {
    story: 'A playable story',
    coreStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    derivedStats: { hp: 10, max_hp: 10, ac: 10, speed: 30 },
  },
  hasUnsavedChanges: false,
  reset: jest.fn(),
  setName: jest.fn(),
  setStory: jest.fn(),
  setCoreStats: jest.fn(),
  setDerivedStats: jest.fn(),
  setLevelExp: jest.fn(),
  assignDefaultStats: jest.fn(),
}

const initialLore: EffectiveTokenCharacterLore = {
  character: {
    id: 'character-123',
    slug: 'playable-character',
    name: 'Playable Character Lore',
    aliases: [],
    summary: 'Lore summary',
    tokenId: 123,
    tags: [],
  },
  matchedCharacterIds: ['character-123'],
  appearances: [],
  locations: [],
  seasons: [],
  sources: [],
  sourceCount: 0,
}

function latestSheetProps() {
  return mockCharacterSheetLayout.mock.calls.at(-1)?.[0] as Record<string, unknown>
}

describe('CharacterDetailClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearchParams = new URLSearchParams()
    mockUseAccount.mockReturnValue({ address: adminAddress })
    useCharacterDetailData.mockReturnValue({
      character,
      setCharacter: jest.fn(),
      isLoading: false,
      refetchCharacter: jest.fn(),
    })
    useCharacterEditor.mockReturnValue(editor)
    useCharacterSave.mockReturnValue({ isSaving: false, saveCharacter: jest.fn() })
    useCharacterImageDisplay.mockReturnValue({
      imageDisclosure: { showPlaceholder: false, isRevealed: true },
      displayedImageUrl: '/character.png',
      handleImageError: jest.fn(),
    })
    useAICharacter.mockReturnValue({
      aiCharacter: { id: 'eliza-character-123' },
      isLoading: false,
      error: null,
      fetchAICharacter: jest.fn(),
    })
  })

  it('passes server-loaded lore props through and preserves the wallet tab alias', async () => {
    mockSearchParams = new URLSearchParams('tab=wallet')

    render(
      <CharacterDetailClient
        tokenIdParam="123"
        showLoreNav={true}
        initialLore={initialLore}
        initialLoreError="lore degraded"
      />
    )

    await waitFor(() => {
      expect(latestSheetProps().activeTab).toBe('on-chain')
    })

    expect(latestSheetProps()).toEqual(expect.objectContaining({
      tokenId: 123,
      lore: initialLore,
      loreError: 'lore degraded',
      canSubmitCommunityStory: true,
      isOwner: true,
      showPersonaAssistant: false,
    }))
  })
})
