import { act, render, screen, waitFor } from '@testing-library/react'
import {
  PersonaAssistantDockSlot,
  PERSONA_ASSISTANT_DOCK_PORTAL_ID,
} from '@/components/chat/PersonaAssistantDockSlot'

const mockUseChatDock = jest.fn()
const mockOpenChat = jest.fn()

jest.mock('@/contexts/ChatDockContext', () => ({
  useChatDock: () => mockUseChatDock(),
}))

function appendAssistantContent() {
  const portalTarget = document.getElementById(PERSONA_ASSISTANT_DOCK_PORTAL_ID)
  expect(portalTarget).toBeInTheDocument()

  act(() => {
    const content = document.createElement('div')
    content.textContent = 'Persona assistant content'
    portalTarget?.appendChild(content)
  })
}

describe('PersonaAssistantDockSlot', () => {
  beforeAll(() => {
    if (!window.PointerEvent) {
      window.PointerEvent = MouseEvent as typeof PointerEvent
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseChatDock.mockReturnValue({ isOpen: false, target: null, openChat: mockOpenChat })
  })

  it('mounts a stable portal target without showing an empty drawer', () => {
    render(<PersonaAssistantDockSlot />)

    expect(document.getElementById(PERSONA_ASSISTANT_DOCK_PORTAL_ID)).toBeInTheDocument()
    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-suppressed', 'false')
    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-has-content', 'false')
    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-visible', 'false')
    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows assistant content in a true right drawer shell', async () => {
    render(<PersonaAssistantDockSlot />)
    appendAssistantContent()

    await waitFor(() => {
      expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-has-content', 'true')
      expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-visible', 'true')
    })

    const drawerPanel = screen.getByTestId('persona-assistant-drawer-panel')
    expect(drawerPanel).toHaveClass('absolute')
    expect(drawerPanel).toHaveClass('right-0')
    expect(drawerPanel).toHaveClass('h-full')
    expect(drawerPanel).toHaveStyle({ width: '500px' })
    expect(drawerPanel).toHaveClass('bg-soul-950')
    expect(drawerPanel).toHaveClass('border-l')
    expect(drawerPanel).toHaveClass('shadow-2xl')
    expect(drawerPanel).toHaveClass('translate-x-0')
    expect(drawerPanel).not.toHaveClass('max-h-[calc(100dvh-7rem)]')
  })

  it('collapses sideways to a right-side rail and can expand again', async () => {
    render(<PersonaAssistantDockSlot />)
    appendAssistantContent()

    await waitFor(() => {
      expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-visible', 'true')
    })

    act(() => {
      window.dispatchEvent(new CustomEvent('persona-assistant-dock-target-change', {
        detail: { tokenId: '123', characterName: 'Test Character', characterId: 'eliza-character-123' },
      }))
    })

    const collapseButton = screen.getByRole('button', { name: /Collapse persona assistant sidebar/i })
    act(() => {
      collapseButton.click()
    })

    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByTestId('persona-assistant-drawer-panel')).toHaveStyle({ width: '56px' })
    expect(document.getElementById(PERSONA_ASSISTANT_DOCK_PORTAL_ID)).toBeInTheDocument()

    const expandButton = screen.getByRole('button', { name: /Expand persona assistant sidebar/i })
    act(() => {
      expandButton.click()
    })

    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getByTestId('persona-assistant-drawer-panel')).toHaveStyle({ width: '500px' })
  })

  it('resizes the drawer horizontally on desktop pointer drag', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })

    render(<PersonaAssistantDockSlot />)
    appendAssistantContent()

    await waitFor(() => {
      expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-visible', 'true')
    })

    act(() => {
      screen.getByTestId('persona-assistant-resize-handle').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 700 })
      )
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600 }))
    })

    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-width', '600')
    expect(screen.getByTestId('persona-assistant-drawer-panel')).toHaveStyle({ width: '600px' })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup'))
    })

    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-resizing', 'false')
  })

  it('opens normal character chat from the assistant sidebar header', async () => {
    render(<PersonaAssistantDockSlot />)
    appendAssistantContent()

    act(() => {
      window.dispatchEvent(new CustomEvent('persona-assistant-dock-target-change', {
        detail: { tokenId: '123', characterName: 'Test Character', characterId: 'eliza-character-123' },
      }))
    })

    const chatButton = await screen.findByRole('button', { name: /^chat$/i })
    act(() => {
      chatButton.click()
    })

    expect(mockOpenChat).toHaveBeenCalledWith({
      tokenId: '123',
      characterName: 'Test Character',
      characterId: 'eliza-character-123',
    })
  })

  it('closes the persona assistant sidebar without unmounting the portal target', async () => {
    render(<PersonaAssistantDockSlot />)
    appendAssistantContent()

    await waitFor(() => {
      expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-visible', 'true')
    })

    act(() => {
      screen.getByRole('button', { name: /Close persona assistant sidebar/i }).click()
    })

    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-dismissed', 'true')
    expect(screen.getByLabelText('Persona assistant dock')).toHaveAttribute('data-visible', 'false')
    expect(document.getElementById(PERSONA_ASSISTANT_DOCK_PORTAL_ID)).toBeInTheDocument()
  })

  it('keeps the portal target mounted but suppresses it while normal chat is open', async () => {
    mockUseChatDock.mockReturnValue({
      isOpen: true,
      target: { tokenId: '123', characterName: 'Test Character' },
    })

    render(<PersonaAssistantDockSlot />)
    appendAssistantContent()

    await waitFor(() => {
      expect(screen.getByLabelText('Persona assistant dock', { selector: 'aside' })).toHaveAttribute('data-has-content', 'true')
    })

    const dock = screen.getByLabelText('Persona assistant dock', { selector: 'aside' })
    expect(dock).toHaveAttribute('aria-hidden', 'true')
    expect(dock).toHaveAttribute('data-suppressed', 'true')
    expect(dock).toHaveAttribute('data-visible', 'false')
    expect(screen.getByTestId('persona-assistant-drawer-panel')).toHaveClass('translate-x-full')
    expect(document.getElementById(PERSONA_ASSISTANT_DOCK_PORTAL_ID)).toBeInTheDocument()
  })
})
