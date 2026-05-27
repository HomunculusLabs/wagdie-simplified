import { wagdieGameMasterCharacter } from '@/services/elizaos/src/characters/wagdie-game-master-character'

describe('WAGDIE game-master persona examples', () => {
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
