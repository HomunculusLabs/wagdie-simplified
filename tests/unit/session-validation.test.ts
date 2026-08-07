/**
 * Tests for session secret validation
 * Tests T017 [US2] - Application startup security
 */

describe('Session Secret Validation', () => {
  const originalEnv = process.env
  async function importSessionModule(): Promise<typeof import('../../lib/auth/session')> {
    let loadedModule: typeof import('../../lib/auth/session') | undefined
    jest.isolateModules(() => {
      jest.doMock('iron-session', () => ({ getIronSession: jest.fn() }))
      jest.doMock('next/headers', () => ({ cookies: jest.fn() }))
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      loadedModule = require('../../lib/auth/session')
    })

    return loadedModule!
  }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('validateSessionSecret', () => {
    it('should throw in production if SESSION_SECRET is not set', async () => {
      process.env.NODE_ENV = 'production'
      delete process.env.SESSION_SECRET

      await expect(importSessionModule()).rejects.toThrow('SESSION_SECRET')
    })

    it('should throw in production if SESSION_SECRET is empty string', async () => {
      process.env.NODE_ENV = 'production'
      process.env.SESSION_SECRET = ''

      await expect(importSessionModule()).rejects.toThrow('SESSION_SECRET')
    })

    it('should allow a missing SESSION_SECRET outside production with dev fallback', async () => {
      process.env.NODE_ENV = 'test'
      delete process.env.SESSION_SECRET

      await expect(importSessionModule()).resolves.toBeDefined()
    })

    it('should throw if explicitly configured SESSION_SECRET is less than 32 characters outside production', async () => {
      process.env.NODE_ENV = 'test'
      process.env.SESSION_SECRET = 'too_short'

      await expect(importSessionModule()).rejects.toThrow('32')
    })

    it('should throw if SESSION_SECRET is less than 32 characters in production', async () => {
      process.env.NODE_ENV = 'production'
      process.env.SESSION_SECRET = 'short_secret_only_25_chars'

      await expect(importSessionModule()).rejects.toThrow('32')
    })

    it('should not throw if SESSION_SECRET is exactly 32 characters', async () => {
      process.env.SESSION_SECRET = 'a'.repeat(32)

      await expect(importSessionModule()).resolves.toBeDefined()
    })

    it('should not throw if SESSION_SECRET is more than 32 characters', async () => {
      process.env.SESSION_SECRET = 'a_very_long_and_secure_session_secret_that_is_definitely_more_than_32_chars'

      await expect(importSessionModule()).resolves.toBeDefined()
    })
  })

  describe('generateNonce', () => {
    it('should generate unique 32-character hex nonces', async () => {
      process.env.SESSION_SECRET = 'a'.repeat(32)
      const { generateNonce } = await importSessionModule()

      const nonce1 = generateNonce()
      const nonce2 = generateNonce()

      expect(nonce1).toHaveLength(32)
      expect(nonce1).toMatch(/^[0-9a-f]{32}$/)
      expect(nonce2).toHaveLength(32)
      expect(nonce2).toMatch(/^[0-9a-f]{32}$/)
      expect(nonce1).not.toBe(nonce2)
    })
  })

  describe('Error message clarity', () => {
    it('should provide clear error message for missing production secret', async () => {
      process.env.NODE_ENV = 'production'
      delete process.env.SESSION_SECRET

      try {
        await importSessionModule()
        fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        const message = (error as Error).message
        expect(message).toContain('SESSION_SECRET')
        expect(message).toMatch(/not set|missing|required/i)
      }
    })

    it('should provide clear error message for short secret', async () => {
      process.env.SESSION_SECRET = 'too_short'

      try {
        await importSessionModule()
        fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        const message = (error as Error).message
        expect(message).toContain('32')
        expect(message).toMatch(/character|length/i)
      }
    })
  })
})
