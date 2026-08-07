/**
 * Tests for rate limiting
 * Tests T022 [US3] - Rate limit sliding window, reset, and fail-open behavior
 */

import { RateLimiter, getRateLimitHeaders } from '@/lib/middleware/rate-limit'

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 60000, // 1 minute
    })
  })

  describe('Sliding window algorithm', () => {
    it('should allow requests under the limit', () => {
      const ip = '127.0.0.1'

      for (let i = 0; i < 10; i++) {
        const result = rateLimiter.check(ip)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(9 - i)
      }
    })

    it('should block requests over the limit', () => {
      const ip = '127.0.0.1'

      // Make 10 requests (limit)
      for (let i = 0; i < 10; i++) {
        rateLimiter.check(ip)
      }

      // 11th request should be blocked
      const result = rateLimiter.check(ip)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should track requests per IP separately', () => {
      const ip1 = '192.168.1.1'
      const ip2 = '192.168.1.2'

      // Exhaust limit for ip1
      for (let i = 0; i < 10; i++) {
        rateLimiter.check(ip1)
      }

      // ip2 should still be allowed
      const result = rateLimiter.check(ip2)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it('should return correct count in result', () => {
      const ip = '127.0.0.1'

      const result = rateLimiter.check(ip)
      expect(result.count).toBe(1)
      expect(result.limit).toBe(10)

      // Make more requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.check(ip)
      }

      const result2 = rateLimiter.check(ip)
      expect(result2.count).toBe(7)
    })
  })

  describe('Window reset', () => {
    it('should reset count after window expires', () => {
      jest.useFakeTimers()
      const ip = '127.0.0.1'

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        rateLimiter.check(ip)
      }

      expect(rateLimiter.check(ip).allowed).toBe(false)

      // Advance time past the window
      jest.advanceTimersByTime(61000) // 61 seconds

      // Should be allowed again
      const result = rateLimiter.check(ip)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)

      jest.useRealTimers()
    })

    it('should return correct resetTime', () => {
      jest.useFakeTimers()
      const now = Date.now()
      jest.setSystemTime(now)

      const ip = '127.0.0.1'
      const result = rateLimiter.check(ip)

      // Reset time should be now + window
      expect(result.resetTime).toBe(now + 60000)

      jest.useRealTimers()
    })
  })

  describe('Fail-open behavior', () => {
    it('should allow requests when storage is unavailable', () => {
      // Create a rate limiter with a broken storage
      const brokenLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60000,
        failOpen: true,
      })

      // Simulate storage failure by making the map throw
      ;(brokenLimiter as any).store.get = jest.fn(() => {
        throw new Error('Storage unavailable')
      })

      // Should still allow the request (fail-open)
      const result = brokenLimiter.check('127.0.0.1')
      expect(result.allowed).toBe(true)
    })
  })

  describe('Cleanup mechanism', () => {
    it('should remove expired entries', () => {
      jest.useFakeTimers()
      const ip = '127.0.0.1'

      rateLimiter.check(ip)
      expect((rateLimiter as any).store.size).toBe(1)

      // Advance time past cleanup interval
      jest.advanceTimersByTime(6 * 60 * 1000) // 6 minutes

      // Trigger cleanup
      rateLimiter.cleanup()

      // Entry should be removed
      expect((rateLimiter as any).store.size).toBe(0)

      jest.useRealTimers()
    })
  })
})

describe('getRateLimitHeaders', () => {
  it('should return correct headers', () => {
    const result = {
      allowed: true,
      remaining: 5,
      resetTime: 1704067200000,
      count: 5,
      limit: 10,
    }

    const headers = getRateLimitHeaders(result)

    expect(headers['X-RateLimit-Limit']).toBe('10')
    expect(headers['X-RateLimit-Remaining']).toBe('5')
    expect(headers['X-RateLimit-Reset']).toBe('1704067200')
  })

  it('should return 0 remaining when blocked', () => {
    const result = {
      allowed: false,
      remaining: 0,
      resetTime: 1704067200000,
      count: 11,
      limit: 10,
    }

    const headers = getRateLimitHeaders(result)

    expect(headers['X-RateLimit-Remaining']).toBe('0')
  })
})
