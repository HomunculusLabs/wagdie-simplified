import { toAgentMessageExamples } from '@/lib/eliza/message-examples'
import { GAME_MASTER_CANONICAL_CONTENT } from '@/lib/eliza/gameMasterAgent/canonicalContent'
import { wagdieGameMasterCharacter } from '@/services/elizaos/src/characters/wagdie-game-master-character'

describe('WAGDIE game-master persona examples', () => {
  it('keeps the static ElizaOS character in parity with the repo-canonical persona', () => {
    const canonicalPersona = GAME_MASTER_CANONICAL_CONTENT.persona

    expect(wagdieGameMasterCharacter.name).toBe(canonicalPersona.name)
    expect(wagdieGameMasterCharacter.username).toBe(canonicalPersona.username)
    expect(wagdieGameMasterCharacter.system).toBe(canonicalPersona.systemPrompt)
    expect(wagdieGameMasterCharacter.backstory).toBe(canonicalPersona.backstory)
    expect(wagdieGameMasterCharacter.bio).toEqual(canonicalPersona.bio)
    expect(wagdieGameMasterCharacter.lore).toEqual(canonicalPersona.lore)
    expect(wagdieGameMasterCharacter.topics).toEqual(canonicalPersona.topics)
    expect(wagdieGameMasterCharacter.adjectives).toEqual(canonicalPersona.adjectives)
    expect(wagdieGameMasterCharacter.style).toEqual(canonicalPersona.style)
    expect(wagdieGameMasterCharacter.postExamples).toEqual(canonicalPersona.postExamples)
    expect(wagdieGameMasterCharacter.settings).toEqual(canonicalPersona.settings)
    expect(wagdieGameMasterCharacter.messageExamples).toEqual(
      toAgentMessageExamples(canonicalPersona.exampleMessages)
    )
  })

  it('uses current location-room GM schema keys instead of obsolete beat prompt keys', () => {
    const serialized = JSON.stringify(wagdieGameMasterCharacter.messageExamples)

    expect(serialized).toContain('publicNarration')
    expect(serialized).toContain('speakerInstruction')
    expect(serialized).toContain('stateSummary')
    expect(serialized).toContain('currentObjective')
    expect(serialized).toContain('openThreads')
    expect(serialized).toContain('selectedSpeakerTokenId')

    expect(serialized).not.toContain('"beat"')
    expect(serialized).not.toContain('"pressure"')
    expect(serialized).not.toContain('"conflict"')
    expect(serialized).not.toContain('"publicPrompt"')
  })
})
