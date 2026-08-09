/**
 * Tweet Repository
 * Infrastructure layer - Handles all database access for tweets
 * Abstracts Supabase implementation details from business logic
 */

import { supabase } from '../supabase'
import type { Tweet, TweetFilters, TweetsResponse } from '@/types/tweet'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not configured')
  }
  return supabase
}

export interface ITweetRepository {
  findMany(filters: TweetFilters): Promise<TweetsResponse>
}

/**
 * Supabase implementation of tweet repository
 */
export class TweetRepository implements ITweetRepository {
  /**
   * Find tweets with filtering, pagination, and sorting
   * Filters out replies and retweets by default
   */
  async findMany(filters: TweetFilters): Promise<TweetsResponse> {
    let query = requireSupabase()
      .from('tweets')
      .select('*')
      // Always filter out replies and retweets
      .eq('is_reply', false)
      .eq('is_retweet', false)

    // Apply media type filter
    if (filters.tab === 'text') {
      query = query.eq('media_type', 'none')
    } else if (filters.tab === 'video') {
      query = query.eq('media_type', 'video')
    }

    // Apply sorting (chronological)
    query = query.order('created_at', { ascending: filters.sort === 'asc' })

    // Apply pagination using cursor
    if (filters.startAt) {
      // Cursor-based pagination: fetch tweets after/before this timestamp
      if (filters.sort === 'desc') {
        query = query.lt('created_at', filters.startAt)
      } else {
        query = query.gt('created_at', filters.startAt)
      }
    }

    // Limit results
    query = query.limit(filters.perPage + 1) // Fetch one extra to check if there are more

    const { data, error } = await query

    if (error) {
      console.error('Error fetching tweets:', error)
      throw new Error(`Failed to fetch tweets: ${error.message}`)
    }

    const tweets = (data || []) as Tweet[]

    // Check if there are more results
    const hasMore = tweets.length > filters.perPage

    // Remove the extra item if present
    const resultTweets = hasMore ? tweets.slice(0, filters.perPage) : tweets

    // Get next cursor (last tweet's created_at)
    const nextCursor = hasMore && resultTweets.length > 0
      ? resultTweets[resultTweets.length - 1].created_at
      : null

    return {
      tweets: resultTweets,
      hasMore,
      nextCursor
    }
  }
}

// Export singleton instance
export const tweetRepository = new TweetRepository()
