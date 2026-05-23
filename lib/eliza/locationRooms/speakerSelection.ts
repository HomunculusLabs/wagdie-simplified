import type { LocationRoomMessage, LocationRoomParticipant } from './types'

export function selectLocationRoomSpeaker(
  participants: LocationRoomParticipant[],
  recentMessages: LocationRoomMessage[]
): LocationRoomParticipant {
  if (participants.length === 0) {
    throw new Error('Cannot select a room speaker without participants')
  }

  const stats = new Map<number, { count: number; lastSequence: number }>()
  for (const participant of participants) {
    stats.set(participant.tokenId, { count: 0, lastSequence: -1 })
  }

  for (const message of recentMessages) {
    if (message.authorKind !== 'agent' || message.tokenId == null) continue
    const participantStats = stats.get(message.tokenId)
    if (!participantStats) continue
    participantStats.count += 1
    participantStats.lastSequence = Math.max(participantStats.lastSequence, message.sequence)
  }

  return [...participants].sort((a, b) => {
    const aStats = stats.get(a.tokenId) ?? { count: 0, lastSequence: -1 }
    const bStats = stats.get(b.tokenId) ?? { count: 0, lastSequence: -1 }

    if (aStats.count !== bStats.count) return aStats.count - bStats.count
    if (aStats.lastSequence !== bStats.lastSequence) return aStats.lastSequence - bStats.lastSequence
    return a.tokenId - b.tokenId
  })[0]
}
