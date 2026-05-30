import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CharacterSheetLayout } from '@/components/characters/detail/CharacterSheetLayout'
import { PERSONA_ASSISTANT_DOCK_PORTAL_ID } from '@/components/chat'

const mockAIPersonaTab = jest.fn(({ assistantPortalId, characterId, showPersonaAssistant }: { assistantPortalId?: string; characterId?: string; showPersonaAssistant?: boolean }) => (
  <div
    data-testid="ai-persona-tab"
    data-assistant-portal-id={assistantPortalId}
    data-character-id={characterId}
    data-show-persona-assistant={showPersonaAssistant ? 'true' : 'false'}
  />
))

jest.mock('@/components/characters/ai-editor', () => ({
  AIPersonaTab: (props: unknown) => mockAIPersonaTab(props),
}))

jest.mock('@/components/chat', () => ({
  PERSONA_ASSISTANT_DOCK_PORTAL_ID: 'persona-assistant-dock-portal',
  PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT: 'persona-assistant-dock-visible-change',
}))

jest.mock('@/components/characters/detail/CharacterActions', () => ({
  CharacterActions: () => <div data-testid="character-actions" />,
}))

jest.mock('@/components/characters/detail/CharacterArtworkCard', () => ({
  CharacterArtworkCard: () => <div data-testid="character-artwork-card" />,
}))

jest.mock('@/components/characters/detail/CharacterEquipmentSection', () => ({
  CharacterEquipmentSection: () => <div data-testid="character-equipment-section" />,
}))

jest.mock('@/components/characters/detail/CharacterIdentityStatsPanel', () => ({
  CharacterIdentityStatsPanel: () => <div data-testid="character-identity-stats-panel" />,
}))

jest.mock('@/components/characters/detail/CharacterStorySection', () => ({
  CharacterStorySection: () => <div data-testid="character-story-section" />,
}))

jest.mock('@/components/characters/detail/CharacterWalletTab', () => ({
  CharacterWalletTab: () => <div data-testid="character-wallet-tab" />,
}))

jest.mock('@/components/characters/CoreStatsEditor', () => ({
  CoreStatsEditor: () => <div data-testid="core-stats-editor" />,
}))

jest.mock('@/components/characters/DerivedStatsEditor', () => ({
  DerivedStatsEditor: () => <div data-testid="derived-stats-editor" />,
}))

jest.mock('@/components/characters/EmptyStatsPrompt', () => ({
  EmptyStatsPrompt: () => <div data-testid="empty-stats-prompt" />,
}))

jest.mock('@/components/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <button type="button" onClick={onClick} className={className}>{children}</button>
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  Tabs: ({ items, activeId, onChange }: { items: Array<{ id: string; label: string }>; activeId: string; onChange: (id: string) => void }) => (
    <div data-testid="character-sheet-tabs" data-active-id={activeId}>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)}>{item.label}</button>
      ))}
    </div>
  ),
}))

jest.mock('@/lib/utils/nft-traits', () => ({
  extractNFTTraits: () => [],
}))

const baseCharacter = {
  infection_status: 'healthy',
  staking_status: null,
  metadata: {},
  hp: 10,
  max_hp: 10,
  ac: 10,
  speed: 30,
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  class: 'pilgrim',
  level: 1,
  owner_address: '0xowner',
  staker_address: null,
}

const baseEditor = {
  state: {
    story: 'A test character story',
    coreStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    derivedStats: { hp: 10, max_hp: 10, ac: 10, speed: 30 },
  },
  setName: jest.fn(),
  setStory: jest.fn(),
  setCoreStats: jest.fn(),
  setDerivedStats: jest.fn(),
  setLevelExp: jest.fn(),
  assignDefaultStats: jest.fn(),
}

const baseProps = {
  activeTab: 'ai-persona' as const,
  onTabChange: jest.fn(),
  tokenId: 123,
  character: baseCharacter as any,
  name: 'Test Character',
  isOwner: true,
  isEditMode: false,
  editor: baseEditor,
  imageUrl: '/test.png',
  imageDisclosure: { showPlaceholder: false, isRevealed: true } as any,
  showLoreNav: true,
  onImageError: jest.fn(),
  onAddCommunityStory: jest.fn(),
  onEnterEditMode: jest.fn(),
  onSear: jest.fn(),
  onInfect: jest.fn(),
  onCure: jest.fn(),
  onChat: jest.fn(),
  chatReadiness: { status: 'ready' as const, characterId: 'eliza-character-123' },
}

describe('CharacterSheetLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('keeps the chat action visible when the canonical AI persona is ready', () => {
    const onChat = jest.fn()

    render(<CharacterSheetLayout {...baseProps} onChat={onChat} />)

    const chatButton = screen.getByRole('button', { name: /chat/i })
    expect(chatButton).toBeInTheDocument()

    fireEvent.click(chatButton)
    expect(onChat).toHaveBeenCalledTimes(1)
  })

  it('shows an actionable missing-persona notice instead of a chat button', () => {
    const onChat = jest.fn()
    const onTabChange = jest.fn()

    render(
      <CharacterSheetLayout
        {...baseProps}
        onChat={onChat}
        onTabChange={onTabChange}
        chatReadiness={{ status: 'missing' }}
      />
    )

    expect(screen.queryByRole('button', { name: /^chat$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/ai persona required before chat/i)).toBeInTheDocument()
    expect(screen.getByText(/click Save AI Persona before chatting/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /open ai persona/i }))
    expect(onTabChange).toHaveBeenCalledWith('ai-persona')
    expect(onChat).not.toHaveBeenCalled()
  })

  it('passes no linked elizaOS id to the AI persona tab while missing', () => {
    render(<CharacterSheetLayout {...baseProps} chatReadiness={{ status: 'missing' }} />)

    expect(screen.getByTestId('ai-persona-tab')).not.toHaveAttribute('data-character-id')
    expect(mockAIPersonaTab).toHaveBeenCalledWith(expect.objectContaining({
      characterId: undefined,
    }))
  })

  it('compacts the artwork and stats rail while the persona assistant dock is visible', async () => {
    const { container } = render(<CharacterSheetLayout {...baseProps} />)

    expect(container.querySelector('[data-persona-dock-compact="true"]')).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new CustomEvent('persona-assistant-dock-visible-change', {
        detail: { visible: true, width: 500 },
      }))
    })

    await waitFor(() => {
      expect(container.querySelector('[data-persona-dock-compact="true"]')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('Character artwork and stats')).toHaveClass('md:col-span-3')
  })

  it('passes the global persona assistant dock portal id and linked elizaOS id to the AI persona tab', () => {
    render(<CharacterSheetLayout {...baseProps} />)

    expect(screen.getByTestId('ai-persona-tab')).toHaveAttribute(
      'data-assistant-portal-id',
      PERSONA_ASSISTANT_DOCK_PORTAL_ID
    )
    expect(screen.getByTestId('ai-persona-tab')).toHaveAttribute('data-character-id', 'eliza-character-123')
    expect(mockAIPersonaTab).toHaveBeenCalledWith(expect.objectContaining({
      assistantPortalId: PERSONA_ASSISTANT_DOCK_PORTAL_ID,
      characterId: 'eliza-character-123',
      showPersonaAssistant: true,
    }))
  })
})
