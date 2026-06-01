import { act, render, screen, waitFor } from '@testing-library/react'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { CHAT_DOCK_VISIBLE_EVENT } from '@/components/chat/dockShell'

const mockUseAccount = jest.fn()
const mockUseElizaAuth = jest.fn()
const mockUseCharacterChat = jest.fn()
const mockUseConversations = jest.fn()

jest.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
}))

jest.mock('@/hooks/useElizaAuth', () => ({
  useElizaAuth: () => mockUseElizaAuth(),
}))

jest.mock('@/hooks/useCharacterChat', () => ({
  useCharacterChat: () => mockUseCharacterChat(),
}))

jest.mock('@/hooks/useConversations', () => ({
  useConversations: () => mockUseConversations(),
}))

const defaultChatHook = {
  messages: [],
  sendMessage: jest.fn(),
  isStreaming: false,
  streamingContent: '',
  conversationId: null,
  newConversation: jest.fn(),
  setConversationId: jest.fn(),
  loadMessages: jest.fn(),
  error: null,
  errorCode: null,
  clearError: jest.fn(),
}

const defaultConversationsHook = {
  conversations: [],
  activeConversation: null,
  isLoading: false,
  isLoadingMore: false,
  isLoadingConversation: false,
  hasMore: false,
  selectConversation: jest.fn(),
  deleteConversation: jest.fn(),
  loadMore: jest.fn(),
  error: null,
  clearError: jest.fn(),
}

function renderChatSidebar() {
  return render(
    <ChatSidebar
      tokenId="123"
      characterName="Test Character"
      characterId="eliza-character-123"
      isOpen
      onClose={jest.fn()}
    />
  )
}

describe('ChatSidebar dock shell', () => {
  beforeAll(() => {
    if (!window.PointerEvent) {
      window.PointerEvent = MouseEvent as typeof PointerEvent
    }

    window.HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })

    mockUseAccount.mockReturnValue({ isConnected: true, address: '0xabc' })
    mockUseElizaAuth.mockReturnValue({
      checkToken: jest.fn(),
      getToken: jest.fn(async () => 'token'),
      isAuthenticated: true,
      isAuthenticating: false,
      authStep: 'complete',
      error: null,
      clearAuth: jest.fn(),
    })
    mockUseCharacterChat.mockReturnValue(defaultChatHook)
    mockUseConversations.mockReturnValue(defaultConversationsHook)
  })

  it('uses the shared right-edge dock shell with resize and collapse controls', async () => {
    renderChatSidebar()

    const dock = screen.getByLabelText('Chat dock')
    const drawerPanel = screen.getByTestId('chat-drawer-panel')

    expect(dock).toHaveAttribute('data-visible', 'true')
    expect(drawerPanel).toHaveClass('absolute')
    expect(drawerPanel).toHaveClass('right-0')
    expect(drawerPanel).toHaveClass('h-full')
    expect(drawerPanel).toHaveClass('translate-x-0')
    expect(drawerPanel).toHaveStyle({ width: '500px' })
    expect(screen.getByTestId('chat-resize-handle')).toBeInTheDocument()

    act(() => {
      screen.getByRole('button', { name: /Collapse chat sidebar/i }).click()
    })

    expect(dock).toHaveAttribute('data-collapsed', 'true')
    expect(drawerPanel).toHaveStyle({ width: '56px' })
    expect(screen.getByRole('button', { name: /Expand chat sidebar/i })).toBeInTheDocument()

    act(() => {
      screen.getByRole('button', { name: /Expand chat sidebar/i }).click()
    })

    expect(dock).toHaveAttribute('data-collapsed', 'false')
    expect(drawerPanel).toHaveStyle({ width: '500px' })
  })

  it('resizes the chat drawer and emits shared geometry events', async () => {
    const geometryListener = jest.fn()
    window.addEventListener(CHAT_DOCK_VISIBLE_EVENT, geometryListener)

    try {
      renderChatSidebar()

      act(() => {
        screen.getByTestId('chat-resize-handle').dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, clientX: 700 })
        )
      })

      act(() => {
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600 }))
      })

      expect(screen.getByLabelText('Chat dock')).toHaveAttribute('data-width', '600')
      expect(screen.getByTestId('chat-drawer-panel')).toHaveStyle({ width: '600px' })

      await waitFor(() => {
        expect(geometryListener).toHaveBeenCalledWith(expect.objectContaining({
          detail: expect.objectContaining({ visible: true, width: 600 }),
        }))
      })
    } finally {
      window.removeEventListener(CHAT_DOCK_VISIBLE_EVENT, geometryListener)
    }
  })
})
