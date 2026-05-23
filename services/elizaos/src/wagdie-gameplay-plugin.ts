type HandlerCallback = (response: Record<string, unknown>) => Promise<unknown[]>;

type ActionResult = {
  success: boolean;
  text?: string;
  values?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string | Error;
};

const WAGDIE_GAMEPLAY_ACTION_TYPES = [
  'attack',
  'defend',
  'help',
  'investigate',
  'negotiate',
  'flee',
  'rest',
] as const;

const GAMEPLAY_CONTEXT_TEXT = [
  'WAGDIE gameplay turns are backend-authoritative. The Next.js backend validates actions, chooses legal targets, hydrates stats, rolls dice, applies mechanics, handles rewards/claims/death/finality, and persists outcomes.',
  'When asked to take a WAGDIE gameplay turn, respond with only a JSON object using this shape:',
  '{',
  '  "actionType": "attack|defend|help|investigate|negotiate|flee|rest",',
  '  "target": { "kind": "monster", "id": "monster-1" },',
  '  "publicSpeech": "short public in-character speech",',
  '  "intentSummary": "brief tactical intent"',
  '}',
  'Use only legal targets supplied in the gameplay prompt. Attack requires a monster target; help requires a character target. Omit target for scene actions when no legal target is needed.',
  'Stats, rewards, reward claims, death, and finality are backend-authoritative. Agents and plugin actions may reference supplied context only; they cannot assign stats, rewards, claim status, HP changes, dice results, or death/finality outcomes.',
].join('\n');

const gameplayContextProvider = {
  name: 'WAGDIE_GAMEPLAY_CONTEXT',
  description: 'Provides WAGDIE gameplay action vocabulary and backend-authoritative turn guidance.',
  position: 50,
  get: async () => ({
    text: GAMEPLAY_CONTEXT_TEXT,
    values: {
      wagdieGameplayActionTypes: WAGDIE_GAMEPLAY_ACTION_TYPES,
      wagdieGameplayBackendAuthoritative: true,
    },
    data: {
      actionTypes: WAGDIE_GAMEPLAY_ACTION_TYPES,
      actionEnvelope: {
        actionType: 'attack|defend|help|investigate|negotiate|flee|rest',
        target: {
          kind: 'monster|character',
          id: 'legal-target-id',
        },
        publicSpeech: 'short public in-character speech',
        intentSummary: 'brief tactical intent',
      },
      authoritativeBackendResponsibilities: [
        'action validation',
        'dice rolls',
        'mechanical deltas',
        'death state',
        'stats',
        'rewards',
        'reward claims',
        'persistence',
      ],
    },
  }),
};

const declareGameplayAction = {
  name: 'DECLARE_WAGDIE_GAMEPLAY_ACTION',
  similes: ['WAGDIE_GAMEPLAY_TURN', 'WAGDIE_DND_ACTION', 'DECLARE_GAMEPLAY_TURN'],
  description:
    'No-op helper for WAGDIE gameplay turns. Use the prompt-supplied legal targets and emit the structured JSON action envelope; the backend validates and resolves all mechanics.',
  validate: async () => true,
  handler: async (
    _runtime: unknown,
    _message: unknown,
    _state?: unknown,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const text = [
      'Declare a WAGDIE gameplay action as JSON only:',
      '{"actionType":"attack|defend|help|investigate|negotiate|flee|rest","target":{"kind":"monster|character","id":"legal-target-id"},"publicSpeech":"short in-character speech","intentSummary":"brief tactical intent"}',
      'This plugin does not resolve mechanics or assign stats, rewards, reward claims, HP, death, or finality; WAGDIE backend validation remains authoritative.',
    ].join('\n');

    if (callback) {
      await callback({
        text,
        actions: ['DECLARE_WAGDIE_GAMEPLAY_ACTION'],
        source: 'wagdie-gameplay-plugin',
      });
    }

    return {
      success: true,
      text,
      values: {
        wagdieGameplayActionTypes: WAGDIE_GAMEPLAY_ACTION_TYPES,
      },
      data: {
        noOp: true,
        backendAuthoritative: true,
        actionTypes: WAGDIE_GAMEPLAY_ACTION_TYPES,
      },
    };
  },
  examples: [
    [
      {
        name: 'user',
        content: {
          text: 'Take your WAGDIE gameplay turn. Legal monster targets: monster-1.',
        },
      },
      {
        name: 'assistant',
        content: {
          text: '{"actionType":"attack","target":{"kind":"monster","id":"monster-1"},"publicSpeech":"By ash and oath, I strike!","intentSummary":"Attack the active monster directly."}',
          actions: ['DECLARE_WAGDIE_GAMEPLAY_ACTION'],
        },
      },
    ],
  ],
};

export const wagdieGameplayPlugin = {
  name: 'wagdie-gameplay-plugin',
  description:
    'Local WAGDIE gameplay vocabulary plugin. Provides context and a no-op action helper; backend gameplay stats, rewards, claims, validation, and mechanics remain authoritative.',
  providers: [gameplayContextProvider],
  actions: [declareGameplayAction],
};

export default wagdieGameplayPlugin;
