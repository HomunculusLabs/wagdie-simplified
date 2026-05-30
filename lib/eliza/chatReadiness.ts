export const AI_PERSONA_REQUIRED_ERROR = 'AI_PERSONA_REQUIRED'

export const AI_PERSONA_REQUIRED_MESSAGE =
  'AI persona not found. Open this character, go to the AI persona tab, connect the owner wallet, review or edit the persona, then click Save AI Persona before chatting.'

export type PublicChatReadiness =
  | { status: 'loading' }
  | { status: 'ready'; characterId: string }
  | { status: 'missing' }
  | { status: 'error'; message: string }
