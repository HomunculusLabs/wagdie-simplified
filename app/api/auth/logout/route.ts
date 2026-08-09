import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth/session'
import { jsonRaw, jsonRawError } from '@/lib/api/responses'
import { withCsrfProtection } from '@/lib/middleware/csrf'

async function handlePost(_request: NextRequest) {
  try {
    const cookieStore = await cookies()

    // Clear iron-session
    const session = await getSession()
    session.destroy()

    // Clear session cookies by setting them to expire immediately
    // Must use set() with maxAge: 0 to properly clear cookies with path
    cookieStore.set('siwe-session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
    cookieStore.set('siwe-nonce', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })

    return jsonRaw({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return jsonRawError('Logout failed', 500)
  }
}

const protectedPost = withCsrfProtection(handlePost)

export async function POST(request: NextRequest) {
  return protectedPost(request)
}
