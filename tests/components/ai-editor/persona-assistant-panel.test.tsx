import { fireEvent, render, screen } from '@testing-library/react'
import { PersonaAssistantPanel } from '@/components/characters/ai-editor/assistant/PersonaAssistantPanel'
import { usePersonaAssistant } from '@/hooks/usePersonaAssistant'

jest.mock('@/hooks/usePersonaAssistant', () => ({
  usePersonaAssistant: jest.fn(),
}))

jest.mock('@/components/ui', () => ({
  Alert: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div role="status"><strong>{title}</strong>{children}</div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>{children}</button>
  ),
}))

const proposal = {
  system: 'Generated system prompt',
  bio: ['Generated bio'],
}

const baseAssistant = {
  messages: [],
  pendingProposal: null,
  warnings: [],
  isLoading: false,
  isSending: false,
  isGenerating: false,
  error: null,
  errorCode: null,
  sendMessage: jest.fn(),
  generateDraft: jest.fn(),
  discardProposal: jest.fn(),
  clearConversation: jest.fn(),
  clearError: jest.fn(),
}

describe('PersonaAssistantPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(usePersonaAssistant as jest.Mock).mockReturnValue(baseAssistant)
  })

  it('keeps proposals pending until Apply to editor is clicked', () => {
    const applyAssistantDraft = jest.fn()
    const saveAICharacter = jest.fn()
    ;(usePersonaAssistant as jest.Mock).mockReturnValue({
      ...baseAssistant,
      pendingProposal: proposal,
      warnings: ['messageExamples was normalized to app-facing exampleMessages'],
    })

    render(
      <PersonaAssistantPanel
        tokenId="123"
        isOwner={true}
        isConnected={true}
        getAssistantSnapshot={() => ({})}
        applyAssistantDraft={applyAssistantDraft}
      />
    )

    expect(screen.getByText(/Review assistant draft/i)).toBeInTheDocument()
    expect(screen.getByText(/Nothing changes until you apply this proposal/i)).toBeInTheDocument()
    expect(screen.queryByText(/Apply and Save/i)).not.toBeInTheDocument()
    expect(applyAssistantDraft).not.toHaveBeenCalled()
    expect(saveAICharacter).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Apply to editor/i }))

    expect(applyAssistantDraft).toHaveBeenCalledWith(proposal)
    expect(baseAssistant.discardProposal).toHaveBeenCalledTimes(1)
    expect(saveAICharacter).not.toHaveBeenCalled()
  })

  it('renders sidebar presentation through the panel and proposal review card', () => {
    ;(usePersonaAssistant as jest.Mock).mockReturnValue({
      ...baseAssistant,
      pendingProposal: proposal,
    })

    render(
      <PersonaAssistantPanel
        tokenId="123"
        isOwner={true}
        isConnected={true}
        presentation="sidebar"
        getAssistantSnapshot={() => ({})}
        applyAssistantDraft={jest.fn()}
      />
    )

    expect(screen.getByText(/Persona Assistant/i).closest('[data-presentation="sidebar"]')).toBeInTheDocument()
    expect(screen.getByText(/Review assistant draft/i).closest('[data-presentation="sidebar"]')).toBeInTheDocument()
  })

  it('sends generate requests through the hook without applying the editor draft', () => {
    const applyAssistantDraft = jest.fn()

    render(
      <PersonaAssistantPanel
        tokenId="123"
        isOwner={true}
        isConnected={true}
        getAssistantSnapshot={() => ({ system: 'Existing' })}
        applyAssistantDraft={applyAssistantDraft}
      />
    )

    fireEvent.change(screen.getByLabelText(/Persona assistant message/i), {
      target: { value: 'Draft this persona.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Generate draft/i }))

    expect(baseAssistant.generateDraft).toHaveBeenCalledWith('Draft this persona.')
    expect(applyAssistantDraft).not.toHaveBeenCalled()
  })

  it('does not render an interactive assistant for non-owners', () => {
    render(
      <PersonaAssistantPanel
        tokenId="123"
        isOwner={false}
        isConnected={true}
        getAssistantSnapshot={() => ({})}
        applyAssistantDraft={jest.fn()}
      />
    )

    expect(screen.queryByText(/Persona Assistant/i)).not.toBeInTheDocument()
  })
})
