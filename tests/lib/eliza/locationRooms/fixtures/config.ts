import { elizaConfig } from '@/lib/eliza/config'

export function withHarnessElizaConfig<T>(
  fn: () => Promise<T>,
  options: { gameplayEnabled?: boolean; gameplayLocationAllowlist?: string[] } = {}
): Promise<T> {
  const originalMode = elizaConfig.mode
  const originalEnabled = elizaConfig.locationRooms.enabled
  const originalNarrativeEnabled = elizaConfig.locationRooms.narrative.enabled
  const originalGameMasterAgentId = elizaConfig.locationRooms.narrative.gameMasterAgentId
  const originalGameplayEnabled = elizaConfig.locationRooms.gameplay.enabled
  const originalOfficialBaseUrl = elizaConfig.official.baseUrl
  const originalGameplayLocationAllowlist = elizaConfig.locationRooms.gameplay.locationAllowlist
  const mutableConfig = elizaConfig as { mode: typeof elizaConfig.mode }
  const mutableRooms = elizaConfig.locationRooms as { enabled: boolean }
  const mutableNarrative = elizaConfig.locationRooms.narrative as { enabled: boolean; gameMasterAgentId: string }
  const mutableGameplay = elizaConfig.locationRooms.gameplay as { enabled: boolean; locationAllowlist: string[] }
  const mutableOfficial = elizaConfig.official as { baseUrl: string }

  mutableConfig.mode = 'official'
  mutableRooms.enabled = true
  mutableNarrative.enabled = true
  mutableNarrative.gameMasterAgentId = 'gm-harness'
  mutableGameplay.enabled = options.gameplayEnabled ?? false
  mutableGameplay.locationAllowlist = options.gameplayLocationAllowlist ?? []
  mutableOfficial.baseUrl = 'https://elizaos.example'

  return fn().finally(() => {
    mutableConfig.mode = originalMode
    mutableRooms.enabled = originalEnabled
    mutableNarrative.enabled = originalNarrativeEnabled
    mutableNarrative.gameMasterAgentId = originalGameMasterAgentId
    mutableGameplay.enabled = originalGameplayEnabled
    mutableGameplay.locationAllowlist = originalGameplayLocationAllowlist
    mutableOfficial.baseUrl = originalOfficialBaseUrl
  })
}
