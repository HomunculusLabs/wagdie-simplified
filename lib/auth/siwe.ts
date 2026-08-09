import { randomBytes } from 'crypto'
import { SiweMessage } from 'siwe'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { supabase } from '../supabase'

export type VerifySiweExpectedFields = {
  nonce?: string
  domain?: string
  uri?: string
  chainId?: number
  address?: string
}

/**
 * Generate a random nonce for SIWE authentication
 */
export function generateNonce(): string {
  return randomBytes(16).toString('hex')
}

function normalizeUri(uri: string): string {
  const url = new URL(uri)
  if (url.pathname === '/' && !url.search && !url.hash) {
    return url.origin
  }

  return url.toString()
}

function normalizeAddress(address: string): string {
  return address.toLowerCase()
}

/**
 * Validate parsed SIWE fields against trusted expectations.
 */
export function validateSiweMessageFields(
  message: string,
  expected: VerifySiweExpectedFields = {}
): { ok: true } | { ok: false; error: string } {
  try {
    const siweMessage = new SiweMessage(message)

    if (expected.nonce && siweMessage.nonce !== expected.nonce) {
      return { ok: false, error: 'Invalid SIWE message' }
    }

    if (expected.domain && siweMessage.domain !== expected.domain) {
      return { ok: false, error: 'Invalid SIWE message' }
    }

    if (expected.uri && normalizeUri(String(siweMessage.uri)) !== normalizeUri(expected.uri)) {
      return { ok: false, error: 'Invalid SIWE message' }
    }

    if (expected.chainId !== undefined && Number(siweMessage.chainId) !== expected.chainId) {
      return { ok: false, error: 'Invalid SIWE message' }
    }

    if (expected.address && normalizeAddress(siweMessage.address) !== normalizeAddress(expected.address)) {
      return { ok: false, error: 'Invalid SIWE message' }
    }

    return { ok: true }
  } catch (error) {
    console.error('SIWE field validation error:', error)
    return { ok: false, error: 'Invalid SIWE message' }
  }
}

/**
 * Verify a SIWE message and signature
 */
export async function verifySiweMessage(
  message: string,
  signature: string,
  expected: VerifySiweExpectedFields = {}
): Promise<{ success: boolean; address?: string; error?: string }> {
  try {
    const fieldValidation = validateSiweMessageFields(message, expected)
    if (!fieldValidation.ok) {
      return { success: false, error: fieldValidation.error }
    }

    const siweMessage = new SiweMessage(message)
    const fields = await siweMessage.verify({
      signature,
      ...(expected.domain ? { domain: expected.domain } : {}),
      ...(expected.nonce ? { nonce: expected.nonce } : {}),
    })

    if (!fields.data.address) {
      return { success: false, error: 'Invalid signature' }
    }

    if (expected.address && normalizeAddress(fields.data.address) !== normalizeAddress(expected.address)) {
      return { success: false, error: 'Invalid SIWE message' }
    }

    return { success: true, address: fields.data.address }
  } catch (error) {
    console.error('SIWE verification error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    }
  }
}

/**
 * Create or update user record in database after successful SIWE verification
 * Note: This requires a 'users' table in Supabase which may not be created yet
 */
export async function upsertUser(ethAddress: string) {
  // TODO: Implement when users table is created in database
  // For now, just return success since session management handles auth
  return { data: { eth_address: ethAddress }, error: null }

  /* Commented out until users table is created
  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('eth_address', ethAddress)
    .single()

  if (existingUser) {
    // Update existing user
    const { data, error } = await supabase
      .from('users')
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (existingUser.login_count || 0) + 1,
      })
      .eq('eth_address', ethAddress)
      .select()
      .single()

    return { data, error }
  } else {
    // Create new user
    const { data, error } = await supabase
      .from('users')
      .insert({
        eth_address,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
        login_count: 1,
      })
      .select()
      .single()

    return { data, error }
  }
  */
}
