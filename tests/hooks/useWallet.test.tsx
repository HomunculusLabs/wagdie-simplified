import { act, renderHook } from '@testing-library/react'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useWallet } from '@/hooks/useWallet'

jest.mock('@rainbow-me/rainbowkit', () => ({
  useConnectModal: jest.fn(),
}))

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useConnect: jest.fn(),
  useDisconnect: jest.fn(),
}))

const mockUseConnectModal = useConnectModal as jest.Mock
const mockUseAccount = useAccount as jest.Mock
const mockUseConnect = useConnect as jest.Mock
const mockUseDisconnect = useDisconnect as jest.Mock

describe('useWallet connect', () => {
  const connectWallet = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      isConnecting: false,
    })
    mockUseConnect.mockReturnValue({ connect: connectWallet, connectors: [] })
    mockUseDisconnect.mockReturnValue({ disconnectAsync: jest.fn() })
    mockUseConnectModal.mockReturnValue({ openConnectModal: undefined })
  })

  it('opens the RainbowKit modal when it is available', () => {
    const openConnectModal = jest.fn()
    const injectedConnector = { id: 'injected' }
    mockUseConnectModal.mockReturnValue({ openConnectModal })
    mockUseConnect.mockReturnValue({
      connect: connectWallet,
      connectors: [injectedConnector],
    })

    const { result } = renderHook(() => useWallet())

    act(() => result.current.connect())

    expect(openConnectModal).toHaveBeenCalledTimes(1)
    expect(connectWallet).not.toHaveBeenCalled()
  })

  it('uses the injected connector when the modal is unavailable', () => {
    const firstConnector = { id: 'walletConnect' }
    const injectedConnector = { id: 'injected' }
    mockUseConnect.mockReturnValue({
      connect: connectWallet,
      connectors: [firstConnector, injectedConnector],
    })

    const { result } = renderHook(() => useWallet())

    act(() => result.current.connect())

    expect(connectWallet).toHaveBeenCalledWith({ connector: injectedConnector })
  })

  it('uses the first configured connector when no injected connector exists', () => {
    const firstConnector = { id: 'walletConnect' }
    mockUseConnect.mockReturnValue({
      connect: connectWallet,
      connectors: [firstConnector, { id: 'coinbaseWallet' }],
    })

    const { result } = renderHook(() => useWallet())

    act(() => result.current.connect())

    expect(connectWallet).toHaveBeenCalledWith({ connector: firstConnector })
  })
})
