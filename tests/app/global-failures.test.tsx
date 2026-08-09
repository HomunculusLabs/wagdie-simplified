import { fireEvent, render, screen } from '@testing-library/react'
import ErrorPage from '@/app/error'
import NotFound from '@/app/not-found'

describe('global failure surfaces', () => {
  it('logs the captured error and preserves reset and home recovery', () => {
    const reset = jest.fn()
    const error = new Error('A very long recoverable failure message')
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<ErrorPage error={error} reset={reset} />)

    expect(consoleError).toHaveBeenCalledWith('Error boundary caught:', error)
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText(error.message)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/')

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(reset).toHaveBeenCalledTimes(1)

    consoleError.mockRestore()
  })

  it('keeps the existing home and NFT collection destinations on the 404 surface', () => {
    render(<NotFound />)

    expect(screen.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return Home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Browse Characters' })).toHaveAttribute('href', '/characters')
  })
})
