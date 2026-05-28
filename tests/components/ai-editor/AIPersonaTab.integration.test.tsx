/**
 * Integration tests for AIPersonaTab Component
 * T059 [P4] [US1-6] Full tab integration tests
 *
 * Test Coverage:
 * - Full tab flow with all 4 sub-tabs
 * - Draft persistence
 * - Save flow
 * - Import/Export flow
 * - Owner vs non-owner states
 * - Loading states
 * - Error handling
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AIPersonaTab } from '@/components/characters/ai-editor/AIPersonaTab'

// Mock wagmi
const mockUseAccount = jest.fn()
jest.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
}))

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}))

// Mock hooks
const mockSaveAICharacter = jest.fn()
const mockExportCharacter = jest.fn()
const mockImportCharacter = jest.fn()
const mockClearError = jest.fn()

jest.mock('@/hooks/useAICharacter', () => ({
  useAICharacter: jest.fn(() => ({
    aiCharacter: {
      name: 'Test Character',
      bio: ['A brave warrior'],
      lore: ['From ancient times'],
      topics: ['combat'],
      adjectives: ['brave'],
      style: { all: ['Be concise'], chat: [], post: [] },
      exampleMessages: [],
      postExamples: [],
      systemPrompt: '',
      knowledge: [],
    },
    isLoading: false,
    isSaving: false,
    isImporting: false,
    error: null,
    saveAICharacter: mockSaveAICharacter,
    exportCharacter: mockExportCharacter,
    importCharacter: mockImportCharacter,
    clearError: mockClearError,
  })),
}))

const mockEditorState = {
  bio: ['A brave warrior'],
  lore: ['From ancient times'],
  topics: ['combat'],
  adjectives: ['brave'],
  style: { all: ['Be concise'], chat: [], post: [] },
  exampleMessages: [],
  postExamples: [],
  systemPrompt: '',
}

const mockSetBio = jest.fn()
const mockSetLore = jest.fn()
const mockSetTopics = jest.fn()
const mockSetAdjectives = jest.fn()
const mockSetStyle = jest.fn()
const mockSetExampleMessages = jest.fn()
const mockSetPostExamples = jest.fn()
const mockSetSystemPrompt = jest.fn()
const mockGetUpdateInput = jest.fn(() => mockEditorState)
const mockClearDraft = jest.fn()
const mockDiscardDraft = jest.fn()
const mockGetAssistantSnapshot = jest.fn(() => ({ bio: ['A brave warrior'] }))
const mockApplyAssistantDraft = jest.fn()

jest.mock('@/hooks/useAIPersonaEditor', () => ({
  useAIPersonaEditor: jest.fn(() => ({
    state: mockEditorState,
    hasUnsavedChanges: false,
    setBio: mockSetBio,
    setLore: mockSetLore,
    setTopics: mockSetTopics,
    setAdjectives: mockSetAdjectives,
    setStyle: mockSetStyle,
    setExampleMessages: mockSetExampleMessages,
    setPostExamples: mockSetPostExamples,
    setSystemPrompt: mockSetSystemPrompt,
    getUpdateInput: mockGetUpdateInput,
    clearDraft: mockClearDraft,
    discardDraft: mockDiscardDraft,
    getAssistantSnapshot: mockGetAssistantSnapshot,
    applyAssistantDraft: mockApplyAssistantDraft,
  })),
}))

const mockUploadDocument = jest.fn()
const mockDeleteDocument = jest.fn()
const mockSetDocuments = jest.fn()

jest.mock('@/hooks/useKnowledgeUpload', () => ({
  useKnowledgeUpload: jest.fn(() => ({
    documents: [],
    isUploading: false,
    isDeleting: false,
    error: null,
    uploadDocument: mockUploadDocument,
    deleteDocument: mockDeleteDocument,
    setDocuments: mockSetDocuments,
    clearError: jest.fn(),
  })),
}))

// Mock sub-components to simplify testing
jest.mock('@/components/characters/ai-editor/tabs/IdentityTab', () => ({
  IdentityTab: jest.fn(({ bio, lore, disabled, readOnly }) => (
    <div data-testid="identity-tab">
      <span data-testid="identity-bio">{JSON.stringify(bio)}</span>
      <span data-testid="identity-disabled">{disabled ? 'true' : 'false'}</span>
      <span data-testid="identity-readonly">{readOnly ? 'true' : 'false'}</span>
    </div>
  )),
}))

jest.mock('@/components/characters/ai-editor/tabs/BehaviorTab', () => ({
  BehaviorTab: jest.fn(({ topics, adjectives, style }) => (
    <div data-testid="behavior-tab">
      <span data-testid="behavior-topics">{JSON.stringify(topics)}</span>
      <span data-testid="behavior-adjectives">{JSON.stringify(adjectives)}</span>
    </div>
  )),
}))

jest.mock('@/components/characters/ai-editor/tabs/ExamplesTab', () => ({
  ExamplesTab: jest.fn(({ exampleMessages, postExamples }) => (
    <div data-testid="examples-tab">
      <span data-testid="examples-messages">{JSON.stringify(exampleMessages)}</span>
      <span data-testid="examples-posts">{JSON.stringify(postExamples)}</span>
    </div>
  )),
}))

jest.mock('@/components/characters/ai-editor/tabs/AdvancedTab', () => ({
  AdvancedTab: jest.fn(({ systemPrompt, knowledgeDocuments }) => (
    <div data-testid="advanced-tab">
      <span data-testid="advanced-prompt">{systemPrompt}</span>
      <span data-testid="advanced-knowledge">{knowledgeDocuments?.length || 0}</span>
    </div>
  )),
}))

jest.mock('@/components/characters/ai-editor/assistant', () => ({
  PersonaAssistantPanel: jest.fn(({ tokenId, isOwner, isConnected, presentation }) => (
    <div
      data-testid="persona-assistant-panel"
      data-token-id={tokenId}
      data-owner={isOwner ? 'true' : 'false'}
      data-connected={isConnected ? 'true' : 'false'}
      data-presentation={presentation}
    >
      Persona Assistant
    </div>
  )),
}))

// Mock UI components
jest.mock('@/components/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Button: ({ children, onClick, disabled, isLoading, variant }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    isLoading?: boolean;
    variant?: string;
  }) => (
    <button onClick={onClick} disabled={disabled || isLoading} data-variant={variant}>
      {isLoading ? 'Loading...' : children}
    </button>
  ),
  Spinner: ({ size }: { size?: string }) => <div data-testid={`spinner-${size}`}>Loading...</div>,
}))

jest.mock('@/components/characters/ai-editor/shared', () => ({
  TabNavigation: ({ tabs, activeTab, onTabChange }: {
    tabs: Array<{ id: string; label: string }>;
    activeTab: string;
    onTabChange: (id: string) => void;
  }) => (
    <div data-testid="tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-testid={`tab-${tab.id}`}
          data-active={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
}))

describe('AIPersonaTab Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAccount.mockReturnValue({ isConnected: true })
  })

  describe('tab navigation', () => {
    it('should render all four tabs', () => {
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByTestId('tab-identity')).toBeInTheDocument()
      expect(screen.getByTestId('tab-behavior')).toBeInTheDocument()
      expect(screen.getByTestId('tab-examples')).toBeInTheDocument()
      expect(screen.getByTestId('tab-advanced')).toBeInTheDocument()
    })

    it('should show Identity tab by default', () => {
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByTestId('identity-tab')).toBeInTheDocument()
      expect(screen.queryByTestId('behavior-tab')).not.toBeInTheDocument()
    })

    it('should switch to Behavior tab when clicked', async () => {
      const user = userEvent.setup()
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      await user.click(screen.getByTestId('tab-behavior'))

      expect(screen.getByTestId('behavior-tab')).toBeInTheDocument()
      expect(screen.queryByTestId('identity-tab')).not.toBeInTheDocument()
    })

    it('should switch to Examples tab when clicked', async () => {
      const user = userEvent.setup()
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      await user.click(screen.getByTestId('tab-examples'))

      expect(screen.getByTestId('examples-tab')).toBeInTheDocument()
    })

    it('should switch to Advanced tab when clicked', async () => {
      const user = userEvent.setup()
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      await user.click(screen.getByTestId('tab-advanced'))

      expect(screen.getByTestId('advanced-tab')).toBeInTheDocument()
    })
  })

  describe('owner vs non-owner', () => {
    it('should show save button for owners', () => {
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByRole('button', { name: /Save AI Persona/i })).toBeInTheDocument()
    })

    it('should render owner editor and assistant regions without removing the editor from full-width flow', () => {
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByTestId('ai-persona-responsive-body')).toBeInTheDocument()
      expect(screen.getByTestId('ai-persona-editor-region')).toBeInTheDocument()
      expect(screen.getByTestId('ai-persona-assistant-region')).toBeInTheDocument()
      expect(screen.getByTestId('ai-persona-assistant-region')).toHaveAttribute('data-placement', 'inline')
      expect(screen.getByLabelText('AI persona editor fields')).toBeInTheDocument()
      expect(screen.getByLabelText('Persona assistant')).toBeInTheDocument()
    })

    it('should portal the owner assistant into a provided dock target without removing the editor', async () => {
      const portalTarget = document.createElement('div')
      portalTarget.id = 'persona-assistant-test-portal'
      document.body.appendChild(portalTarget)

      try {
        render(<AIPersonaTab tokenId="123" isOwner={true} assistantPortalId="persona-assistant-test-portal" />)

        expect(screen.getByTestId('ai-persona-editor-region')).toBeInTheDocument()
        await waitFor(() => {
          const assistantRegion = portalTarget.querySelector('[data-testid="ai-persona-assistant-region"]')
          expect(assistantRegion).toBeInTheDocument()
          expect(assistantRegion).toHaveAttribute('data-placement', 'dock')
        })
        expect(screen.getByTestId('ai-persona-responsive-body')).not.toContainElement(
          portalTarget.querySelector('[data-testid="ai-persona-assistant-region"]')
        )
      } finally {
        portalTarget.remove()
      }
    })

    it('should wire the owner assistant panel to editor snapshot and apply callbacks without save callbacks', () => {
      const { PersonaAssistantPanel } = jest.requireMock('@/components/characters/ai-editor/assistant')

      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByTestId('persona-assistant-panel')).toBeInTheDocument()
      expect(PersonaAssistantPanel).toHaveBeenCalled()
      const assistantProps = (PersonaAssistantPanel as jest.Mock).mock.calls[0][0]
      expect(assistantProps).toEqual(expect.objectContaining({
        tokenId: '123',
        isOwner: true,
        isConnected: true,
        getAssistantSnapshot: mockGetAssistantSnapshot,
        applyAssistantDraft: mockApplyAssistantDraft,
        presentation: 'sidebar',
      }))
      expect(assistantProps).not.toHaveProperty('saveAICharacter')
      expect(assistantProps).not.toHaveProperty('onSave')
      expect(assistantProps).not.toHaveProperty('handleSave')
    })

    it('should render the editor region without an assistant region for non-owners', () => {
      render(<AIPersonaTab tokenId="123" isOwner={false} />)

      expect(screen.getByTestId('ai-persona-editor-region')).toBeInTheDocument()
      expect(screen.queryByTestId('ai-persona-assistant-region')).not.toBeInTheDocument()
      expect(screen.queryByTestId('persona-assistant-panel')).not.toBeInTheDocument()
    })

    it('should not show save button for non-owners', () => {
      render(<AIPersonaTab tokenId="123" isOwner={false} />)

      expect(screen.queryByRole('button', { name: /Save AI Persona/i })).not.toBeInTheDocument()
    })

    it('should pass readOnly=true to tabs for non-owners', () => {
      render(<AIPersonaTab tokenId="123" isOwner={false} />)

      expect(screen.getByTestId('identity-readonly')).toHaveTextContent('true')
    })

    it('should pass readOnly=false to tabs for owners', () => {
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByTestId('identity-readonly')).toHaveTextContent('false')
    })

    it('should show import/export buttons for owners', () => {
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument()
    })

    it('should not show import/export buttons for non-owners', () => {
      render(<AIPersonaTab tokenId="123" isOwner={false} />)

      expect(screen.queryByRole('button', { name: /Import/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Export/i })).not.toBeInTheDocument()
    })
  })

  describe('save flow', () => {
    it('should call saveAICharacter when save button is clicked', async () => {
      const user = userEvent.setup()
      mockSaveAICharacter.mockResolvedValueOnce(true)

      // Enable the save button by simulating unsaved changes
      const useAIPersonaEditor = jest.requireMock('@/hooks/useAIPersonaEditor').useAIPersonaEditor
      useAIPersonaEditor.mockReturnValue({
        state: mockEditorState,
        hasUnsavedChanges: true,
        setBio: mockSetBio,
        setLore: mockSetLore,
        setTopics: mockSetTopics,
        setAdjectives: mockSetAdjectives,
        setStyle: mockSetStyle,
        setExampleMessages: mockSetExampleMessages,
        setPostExamples: mockSetPostExamples,
        setSystemPrompt: mockSetSystemPrompt,
        getUpdateInput: mockGetUpdateInput,
        clearDraft: mockClearDraft,
        discardDraft: mockDiscardDraft,
        getAssistantSnapshot: mockGetAssistantSnapshot,
        applyAssistantDraft: mockApplyAssistantDraft,
      })

      render(<AIPersonaTab tokenId="123" isOwner={true} characterName="Test" />)

      const saveButton = screen.getByRole('button', { name: /Save AI Persona/i })
      await user.click(saveButton)

      expect(mockSaveAICharacter).toHaveBeenCalled()
    })

    it('should disable save button when wallet not connected', () => {
      mockUseAccount.mockReturnValue({ isConnected: false })

      const useAIPersonaEditor = jest.requireMock('@/hooks/useAIPersonaEditor').useAIPersonaEditor
      useAIPersonaEditor.mockReturnValue({
        state: mockEditorState,
        hasUnsavedChanges: true,
        setBio: mockSetBio,
        setLore: mockSetLore,
        setTopics: mockSetTopics,
        setAdjectives: mockSetAdjectives,
        setStyle: mockSetStyle,
        setExampleMessages: mockSetExampleMessages,
        setPostExamples: mockSetPostExamples,
        setSystemPrompt: mockSetSystemPrompt,
        getUpdateInput: mockGetUpdateInput,
        clearDraft: mockClearDraft,
        discardDraft: mockDiscardDraft,
        getAssistantSnapshot: mockGetAssistantSnapshot,
        applyAssistantDraft: mockApplyAssistantDraft,
      })

      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      const saveButton = screen.getByRole('button', { name: /Save AI Persona/i })
      expect(saveButton).toBeDisabled()
    })
  })

  describe('export flow', () => {
    it('should call exportCharacter when export button is clicked', async () => {
      const user = userEvent.setup()
      mockExportCharacter.mockResolvedValueOnce(undefined)

      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      const exportButton = screen.getByRole('button', { name: /Export/i })
      await user.click(exportButton)

      expect(mockExportCharacter).toHaveBeenCalled()
    })
  })

  describe('import flow', () => {
    it('should have hidden file input for import', () => {
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeInTheDocument()
      expect(fileInput).toHaveClass('hidden')
    })

    it('should trigger file input click when import button is clicked', async () => {
      const user = userEvent.setup()
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const clickSpy = jest.spyOn(fileInput, 'click')

      const importButton = screen.getByRole('button', { name: /Import/i })
      await user.click(importButton)

      expect(clickSpy).toHaveBeenCalled()
    })
  })

  describe('data passing to tabs', () => {
    it('should pass bio data to IdentityTab', () => {
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByTestId('identity-bio')).toHaveTextContent('A brave warrior')
    })

    it('should pass topics to BehaviorTab', async () => {
      const user = userEvent.setup()
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      await user.click(screen.getByTestId('tab-behavior'))

      expect(screen.getByTestId('behavior-topics')).toHaveTextContent('combat')
    })

    it('should pass adjectives to BehaviorTab', async () => {
      const user = userEvent.setup()
      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      await user.click(screen.getByTestId('tab-behavior'))

      expect(screen.getByTestId('behavior-adjectives')).toHaveTextContent('brave')
    })
  })

  describe('discard flow', () => {
    it('should show discard button when there are unsaved changes', () => {
      const useAIPersonaEditor = jest.requireMock('@/hooks/useAIPersonaEditor').useAIPersonaEditor
      useAIPersonaEditor.mockReturnValue({
        state: mockEditorState,
        hasUnsavedChanges: true,
        setBio: mockSetBio,
        setLore: mockSetLore,
        setTopics: mockSetTopics,
        setAdjectives: mockSetAdjectives,
        setStyle: mockSetStyle,
        setExampleMessages: mockSetExampleMessages,
        setPostExamples: mockSetPostExamples,
        setSystemPrompt: mockSetSystemPrompt,
        getUpdateInput: mockGetUpdateInput,
        clearDraft: mockClearDraft,
        discardDraft: mockDiscardDraft,
        getAssistantSnapshot: mockGetAssistantSnapshot,
        applyAssistantDraft: mockApplyAssistantDraft,
      })

      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByRole('button', { name: /Discard Changes/i })).toBeInTheDocument()
    })

    it('should call discardDraft when discard button is clicked', async () => {
      const user = userEvent.setup()

      const useAIPersonaEditor = jest.requireMock('@/hooks/useAIPersonaEditor').useAIPersonaEditor
      useAIPersonaEditor.mockReturnValue({
        state: mockEditorState,
        hasUnsavedChanges: true,
        setBio: mockSetBio,
        setLore: mockSetLore,
        setTopics: mockSetTopics,
        setAdjectives: mockSetAdjectives,
        setStyle: mockSetStyle,
        setExampleMessages: mockSetExampleMessages,
        setPostExamples: mockSetPostExamples,
        setSystemPrompt: mockSetSystemPrompt,
        getUpdateInput: mockGetUpdateInput,
        clearDraft: mockClearDraft,
        discardDraft: mockDiscardDraft,
        getAssistantSnapshot: mockGetAssistantSnapshot,
        applyAssistantDraft: mockApplyAssistantDraft,
      })

      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      const discardButton = screen.getByRole('button', { name: /Discard Changes/i })
      await user.click(discardButton)

      expect(mockDiscardDraft).toHaveBeenCalled()
    })
  })

  describe('empty state', () => {
    it('should show empty state for non-owners when no character', () => {
      const useAICharacter = jest.requireMock('@/hooks/useAICharacter').useAICharacter
      useAICharacter.mockReturnValue({
        aiCharacter: null,
        isLoading: false,
        isSaving: false,
        isImporting: false,
        error: null,
        saveAICharacter: mockSaveAICharacter,
        exportCharacter: mockExportCharacter,
        importCharacter: mockImportCharacter,
        clearError: mockClearError,
      })

      render(<AIPersonaTab tokenId="123" isOwner={false} />)

      expect(screen.getByText(/No AI Persona Configured/i)).toBeInTheDocument()
    })
  })

  describe('unsaved changes warning', () => {
    it('should show unsaved changes warning when there are changes', () => {
      const useAIPersonaEditor = jest.requireMock('@/hooks/useAIPersonaEditor').useAIPersonaEditor
      useAIPersonaEditor.mockReturnValue({
        state: mockEditorState,
        hasUnsavedChanges: true,
        setBio: mockSetBio,
        setLore: mockSetLore,
        setTopics: mockSetTopics,
        setAdjectives: mockSetAdjectives,
        setStyle: mockSetStyle,
        setExampleMessages: mockSetExampleMessages,
        setPostExamples: mockSetPostExamples,
        setSystemPrompt: mockSetSystemPrompt,
        getUpdateInput: mockGetUpdateInput,
        clearDraft: mockClearDraft,
        discardDraft: mockDiscardDraft,
        getAssistantSnapshot: mockGetAssistantSnapshot,
        applyAssistantDraft: mockApplyAssistantDraft,
      })

      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()
    })
  })

  describe('wallet not connected warning', () => {
    it('should show wallet warning for owners when not connected', () => {
      mockUseAccount.mockReturnValue({ isConnected: false })

      render(<AIPersonaTab tokenId="123" isOwner={true} />)

      expect(screen.getByText(/Connect your wallet/i)).toBeInTheDocument()
    })
  })
})
