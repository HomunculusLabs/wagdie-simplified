/**
 * Location Repository - Data Access Layer
 *
 * Handles all database operations for the locations table.
 * Follows Clean Architecture by keeping data access logic separate from business logic.
 */

import { inspect } from 'util';
import type {
  Location,
  LocationMetadata,
  LocationRepository as ILocationRepository,
  CreateLocationInput,
  UpdateLocationInput,
} from '../types/map';
import { normalizeLocationMetadata } from '@/lib/domain/location/metadata';
import { normalizeLocationSpecialProperties } from '@/lib/domain/location/validation';
import {
  getRequiredSupabaseAdminClient,
  getRequiredSupabaseClient,
} from '@/lib/repositories/supabase-repository-client';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function cleanNullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() || null;
}

function setMetadataTextProperty(
  target: Record<string, unknown>,
  key: 'region' | 'terrain',
  value: string | null | undefined
): void {
  if (value === undefined) return;
  const cleaned = cleanNullableText(value);
  if (cleaned) target[key] = cleaned;
  else delete target[key];
}

function buildMetadata(
  input: CreateLocationInput | UpdateLocationInput,
  existingMetadata?: LocationMetadata
): LocationMetadata {
  const metadata: Record<string, unknown> = existingMetadata ? { ...existingMetadata } : {};

  if (input.coordinates !== undefined) {
    metadata.coordinates = input.coordinates;
    metadata.center = [input.coordinates.x, input.coordinates.y] as [number, number];
    metadata.bounds = [
      [input.coordinates.x - 25, input.coordinates.y - 25],
      [input.coordinates.x + 25, input.coordinates.y + 25],
    ] as [[number, number], [number, number]];
  }

  const existingProperties = isPlainObject(metadata.properties)
    ? { ...(metadata.properties as Record<string, unknown>) }
    : {};

  setMetadataTextProperty(existingProperties, 'region', input.region);
  setMetadataTextProperty(existingProperties, 'terrain', input.terrain);

  if (input.difficulty !== undefined) {
    if (input.difficulty) existingProperties.difficulty = input.difficulty;
    else delete existingProperties.difficulty;
  }

  if (Object.keys(existingProperties).length > 0) {
    metadata.properties = existingProperties;
  } else {
    delete metadata.properties;
  }

  const specialProperties = normalizeLocationSpecialProperties(input.special_properties);
  if (specialProperties !== undefined) {
    if (specialProperties.length > 0) metadata.special_properties = specialProperties;
    else delete metadata.special_properties;
  }

  if (!metadata.bounds) {
    metadata.bounds = [[0, 0], [0, 0]];
  }

  return metadata as unknown as LocationMetadata;
}

function hasMetadataUpdates(input: UpdateLocationInput): boolean {
  return input.coordinates !== undefined ||
    input.region !== undefined ||
    input.terrain !== undefined ||
    input.difficulty !== undefined ||
    input.special_properties !== undefined;
}

function formatSupabaseError(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.toString();
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name : undefined;
    const message = typeof e.message === 'string' ? e.message : undefined;
    const details = typeof e.details === 'string' ? e.details : undefined;
    const hint = typeof e.hint === 'string' ? e.hint : undefined;
    const code = typeof e.code === 'string' ? e.code : undefined;

    const parts = [name, message, details, hint, code ? `code=${code}` : undefined].filter(
      (p): p is string => Boolean(p && p.trim())
    );
    if (parts.length > 0) return parts.join(' | ');

    // Fall back to showing hidden properties (Supabase errors can be non-enumerable)
    return inspect(err, { depth: 6, breakLength: 140, compact: true, showHidden: true });
  }
  return 'Unknown error';
}

function normalizeLocation(raw: unknown): Location {
  const loc = (raw ?? {}) as Record<string, unknown>;
  const safeLoc: Record<string, unknown> = isPlainObject(loc) ? loc : {};
  const now = new Date().toISOString();
  const createdAt = typeof safeLoc.created_at === 'string' ? safeLoc.created_at : now;
  const updatedAt = typeof safeLoc.updated_at === 'string' ? safeLoc.updated_at : now;
  const normalizedMetadata =
    normalizeLocationMetadata(safeLoc.metadata) as unknown as Location['metadata'];
  const metadataChainId =
    isPlainObject(safeLoc.metadata) && 'chain_location_id' in safeLoc.metadata
      ? (safeLoc.metadata as Record<string, unknown>).chain_location_id
      : undefined;
  const chainLocationId =
    (safeLoc as { chain_location_id?: unknown }).chain_location_id ?? metadataChainId;

  return {
    ...(safeLoc as unknown as Location),
    image_url: typeof safeLoc.image_url === 'string' ? safeLoc.image_url : null,
    lore: typeof safeLoc.lore === 'string' ? safeLoc.lore : null,
    chain_location_id: chainLocationId as Location['chain_location_id'],
    metadata: normalizedMetadata,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

/**
 * Repository implementation for accessing location data from Supabase
 */
export class LocationRepository implements ILocationRepository {
  /**
   * Fetch all available locations from Supabase
   * @returns Promise<Location[]> - Array of all locations
   */
  async getAll(): Promise<Location[]> {
    try {
      const supabase = getRequiredSupabaseClient('locations.getAll');

      // Add timeout to prevent hanging
      const fetchPromise = supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('name');

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Supabase query timeout')), 5000);
      });

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as { data?: unknown; error?: { message?: string } };

      if (error) {
        throw new Error(`Failed to fetch locations: ${error.message}`);
      }

      // If query succeeds and returns empty, return empty (do not fall back to mocks)
      const rows: unknown[] = Array.isArray(data) ? data : [];
      return rows.map(normalizeLocation);
    } catch (error) {
      console.error('LocationRepository.getAll() error:', error);
      // Return mock data only when Supabase is not available (failure/timeout/unavailable)
      return this.getMockLocations().map(normalizeLocation);
    }
  }

  /**
   * Get mock location data for development/testing
   * @returns Location[] - Array of mock locations
   */
  getMockLocations(): Location[] {
    return [
      {
        id: 'loc-1',
        name: 'The Abyss',
        description: 'A dark and treacherous realm',
        image_url: null,
        lore: null,
        metadata: {
          bounds: [[0, 0], [250, 250]],
          center: [125, 125],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'loc-2',
        name: 'Eternal Flames',
        description: 'A burning wasteland of perpetual fire',
        image_url: null,
        lore: null,
        metadata: {
          bounds: [[250, 0], [500, 250]],
          center: [375, 125],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'loc-3',
        name: 'Shadow Grove',
        description: 'A mysterious forest shrouded in darkness',
        image_url: null,
        lore: null,
        metadata: {
          bounds: [[500, 0], [750, 250]],
          center: [625, 125],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }

  /**
   * Fetch a single location by ID
   * @param id - Location UUID
   * @returns Promise<Location | null> - Location or null if not found
   */
  async getById(id: string): Promise<Location | null> {
    try {
      const supabase = getRequiredSupabaseClient('locations.getById');

      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('id', id)
        .single();

      // PGRST116 is the error code for "no rows returned" which is expected
      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to fetch location: ${error.message}`);
      }

      return data ? normalizeLocation(data) : null;
    } catch (error) {
      console.error(`LocationRepository.getById(${id}) error:`, error);
      throw error;
    }
  }

  /**
   * Fetch a location with its associated character count
   * @param id - Location UUID
   * @returns Promise<Location | null> - Location with eager-loaded character count
   */
  async getWithCharacters(id: string): Promise<Location | null> {
    try {
      const supabase = getRequiredSupabaseClient('locations.getWithCharacters');

      const { data, error } = await supabase
        .from('locations')
        .select(`
          *,
          character_locations (
            character_token_id,
            wallet_address,
            status
          )
        `)
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to fetch location with characters: ${error.message}`);
      }

      return data ? normalizeLocation(data) : null;
    } catch (error) {
      console.error(`LocationRepository.getWithCharacters(${id}) error:`, error);
      throw error;
    }
  }

  /**
   * Create a new location
   * @param id - Location slug (e.g., 'dragons_lair')
   * @param input - Location data
   * @returns Promise<Location> - Created location
   */
  async create(id: string, input: CreateLocationInput): Promise<Location> {
    try {
      const supabaseAdmin = getRequiredSupabaseAdminClient('locations.create');

      const locationData = {
        id,
        name: input.name.trim(),
        description: cleanNullableText(input.description) ?? null,
        image_url: cleanNullableText(input.image_url) ?? null,
        lore: cleanNullableText(input.lore) ?? null,
        metadata: buildMetadata(input),
        // Note: created_at has a default value in the database
      };

      // Insert without select (Supabase returns empty on insert with RLS)
      const insertResult = await supabaseAdmin
        .from('locations')
        .insert(locationData);

      if (insertResult.error) {
        if (insertResult.error.code === '23505') {
          throw new Error(`Location with ID '${id}' already exists`);
        }
        throw new Error(`Failed to create location: ${insertResult.error.message || insertResult.error.code || 'Unknown error'}`);
      }

      // Fetch the created location
      const { data, error: fetchError } = await supabaseAdmin
        .from('locations')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !data) {
        // Insert succeeded but fetch failed - return constructed location (normalized)
        return normalizeLocation({
          ...locationData,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          character_locations: [],
        } as Location);
      }

      return normalizeLocation(data);
    } catch (error) {
      console.error('LocationRepository.create() error:', error);
      throw error;
    }
  }

  /**
   * Update an existing location
   * @param id - Location slug
   * @param input - Fields to update
   * @returns Promise<Location> - Updated location
   */
  async update(id: string, input: UpdateLocationInput): Promise<Location> {
    try {
      const supabaseAdmin = getRequiredSupabaseAdminClient('locations.update');

      // First fetch the existing location to merge metadata
      const existing = await this.getById(id);
      if (!existing) {
        throw new Error(`Location '${id}' not found`);
      }

      const updateData: Record<string, unknown> = {};

      if (input.name !== undefined) {
        updateData.name = input.name.trim();
      }

      if (input.description !== undefined) {
        updateData.description = cleanNullableText(input.description) ?? null;
      }

      if (input.image_url !== undefined) {
        updateData.image_url = cleanNullableText(input.image_url) ?? null;
      }

      if (input.lore !== undefined) {
        updateData.lore = cleanNullableText(input.lore) ?? null;
      }

      if (hasMetadataUpdates(input)) {
        updateData.metadata = buildMetadata(input, existing.metadata);
      }

      const response = await supabaseAdmin
        .from('locations')
        .update(updateData)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (response.error) {
        const usingServiceRole = true;
        throw new Error(
          `Failed to update location '${id}': ${formatSupabaseError(response.error)} (status=${response.status} serviceRole=${usingServiceRole})`
        );
      }

      if (!response.data) {
        throw new Error(`Failed to update location '${id}': no data returned`);
      }

      return normalizeLocation(response.data);
    } catch (error) {
      console.error(`LocationRepository.update(${id}) error:`, error);
      throw error;
    }
  }

  /**
   * Delete a location
   * @param id - Location slug
   */
  async delete(id: string): Promise<void> {
    try {
      const supabaseAdmin = getRequiredSupabaseAdminClient('locations.delete');

      const { error } = await supabaseAdmin
        .from('locations')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete location: ${error.message}`);
      }
    } catch (error) {
      console.error(`LocationRepository.delete(${id}) error:`, error);
      throw error;
    }
  }

  /**
   * Get count of staked characters at a location
   * @param id - Location slug
   * @returns Promise<number> - Count of staked characters
   */
  async getStakedCharacterCount(id: string): Promise<number> {
    try {
      const supabase = getRequiredSupabaseClient('locations.getStakedCharacterCount');

      const { count, error } = await supabase
        .from('character_locations')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', id)
        .eq('status', 'confirmed');

      if (error) {
        console.error(`Failed to count staked characters: ${error.message}`);
        return 0;
      }

      return isFiniteNumber(count) ? count : 0;
    } catch (error) {
      console.error(`LocationRepository.getStakedCharacterCount(${id}) error:`, error);
      return 0;
    }
  }

  /**
   * Check if a location ID already exists
   * @param id - Location slug to check
   * @returns Promise<boolean> - True if exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const supabase = getRequiredSupabaseClient('locations.exists');

      const { count, error } = await supabase
        .from('locations')
        .select('*', { count: 'exact', head: true })
        .eq('id', id);

      if (error) {
        return false;
      }

      return isFiniteNumber(count) ? count > 0 : false;
    } catch {
      return false;
    }
  }

  /**
   * Get all existing location IDs (for unique slug generation)
   * @returns Promise<string[]> - Array of existing IDs
   */
  async getAllIds(): Promise<string[]> {
    try {
      const supabase = getRequiredSupabaseClient('locations.getAllIds');

      const { data, error } = await supabase
        .from('locations')
        .select('id');

      if (error) {
        return [];
      }

      return data?.map((loc) => loc.id) ?? [];
    } catch {
      return [];
    }
  }
}
