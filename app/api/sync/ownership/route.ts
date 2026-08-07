/**
 * Ownership Sync API Route
 * Syncs NFT ownership from blockchain to database
 * Can be triggered by Vercel cron or manually
 */

import { NextRequest } from 'next/server'
import { jsonRaw, jsonRawError } from '@/lib/api/responses'
import { verifySyncAuthorization } from '@/lib/api/sync-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { OwnershipSyncService } from '@/lib/services/sync/ownership-sync-service'

/**
 * GET handler for Vercel cron (cron sends GET requests)
 */
export async function GET(request: NextRequest) {
  return handleSync(request)
}

/**
 * POST handler for manual triggers
 */
export async function POST(request: NextRequest) {
  return handleSync(request)
}

/**
 * Main sync handler
 */
async function handleSync(request: NextRequest) {
  // Verify authorization
  if (!verifySyncAuthorization(request)) {
    return jsonRawError('Unauthorized', 401)
  }

  try {
    // Create admin client for database writes
    const supabaseAdmin = createSupabaseAdminClient()
    if (!supabaseAdmin) {
      return jsonRawError('Supabase admin client not configured', 500)
    }

    // Create sync service with admin client
    const syncService = new OwnershipSyncService({
      chunkSize: 100,
      delayMs: 100,
      supabaseClient: supabaseAdmin,
    })

    // Run the sync
    console.log('[Ownership Sync] Starting sync...')
    const result = await syncService.runFullSync()
    console.log('[Ownership Sync] Sync completed:', result)

    // Return appropriate status based on result
    if (result.success) {
      return jsonRaw({
        success: true,
        message: 'Ownership sync completed successfully',
        stats: {
          tokensProcessed: result.tokensProcessed,
          tokensUpdated: result.tokensUpdated,
          duration: `${result.duration}ms`,
        },
        timestamp: result.timestamp,
      })
    } else {
      return jsonRaw(
        {
          success: false,
          message: 'Ownership sync completed with errors',
          stats: {
            tokensProcessed: result.tokensProcessed,
            tokensUpdated: result.tokensUpdated,
            tokensFailed: result.tokensFailed,
            duration: `${result.duration}ms`,
          },
          errors: result.errors,
          timestamp: result.timestamp,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[Ownership Sync] Error:', error)
    return jsonRaw(
      {
        error: 'Sync failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
