/**
 * Utility functions for parsing and validating on-chain location IDs.
 *
 * The WAGDIE World contract uses uint64 for location IDs.
 * DB locations use string slugs/UUIDs as primary keys.
 * This module bridges the gap by safely parsing chain IDs from various sources.
 */

/**
 * Safely parse a chain location ID from various input types.
 * Returns bigint if valid, null otherwise.
 *
 * Valid inputs:
 * - bigint (returned as-is if >= 0)
 * - number (finite, non-negative integer)
 * - string (numeric string that parses to non-negative bigint)
 */
export function parseChainLocationId(value: unknown): bigint | null {
  if (value === null || value === undefined) return null
  
  if (typeof value === 'bigint') {
    return value >= 0n ? value : null
  }
  
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return null
    }
    return BigInt(value)
  }
  
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    
    // Reject non-numeric strings early (slugs like \"dragons_lair\")
    if (!/^[0-9]+$/.test(trimmed)) return null
    
    try {
      const parsed = BigInt(trimmed)
      return parsed >= 0n ? parsed : null
    } catch {
      return null
    }
  }
  
  return null
}

/**
 * Check if a value is a valid chain location ID.
 */
export function isValidChainLocationId(value: unknown): boolean {
  return parseChainLocationId(value) !== null
}

/**
 * Validate that a location has a valid chain_location_id for staking.
 * Returns the parsed bigint or throws a descriptive error.
 */
export function requireChainLocationId(
  locationId: string,
  chainLocationId: unknown
): bigint {
  const parsed = parseChainLocationId(chainLocationId)
  
  if (parsed === null) {
    throw new Error(
      `Location "${locationId}" does not have a valid on-chain location ID. ` +
      `Got: ${JSON.stringify(chainLocationId)}`
    )
  }
  
  return parsed
}
