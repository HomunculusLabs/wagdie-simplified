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

const WAGDIE_SCENE_ACTION_INTENTS = [
  'inspect',
  'search',
  'examine',
  'decipher',
  'negotiate',
  'protect',
  'force',
  'move',
] as const;

const WAGDIE_FIXED_ROLL_CHECKS = [
  'attack',
  'defend',
  'help',
  'investigate',
  'perception',
  'stealth',
  'survival',
  'arcana',
  'history',
  'nature',
  'religion',
  'insight',
  'persuasion',
  'intimidation',
  'athletics',
  'acrobatics',
] as const;

const NARRATIVE_DIRECTIVE_TEXT = [
  'WAGDIE public GM narration is watch-facing scene direction, not character dialogue.',
  'The GM must never write quoted character speech or report what a character says, asks, answers, whispers, or shouts. Character agents own their own publicSpeech.',
  'Every public GM beat should give observers a reason to watch the next turn: a visible change, cost, clue, route, obstacle, demand, timer, or hard choice.',
  'For Crow\'s Den / location 11, anchor scenes in the black bell, braided rope, rafters, shutters, salt threshold, cellar casks, bottle-glass ledger, roof ledger, road/door threshold, or named NPC motives.',
  'Prefer specific local nouns over generic pressure. Avoid filler such as "the room shifts", "danger gathers", or "something moves just out of sight" unless a concrete feature also changes.',
  'Keep canon restraint: make provisional scene pressure and consequences, not permanent project lore or token finality.',
].join('\n');

const GAMEPLAY_CONTEXT_TEXT = [
  NARRATIVE_DIRECTIVE_TEXT,
  '',
  'WAGDIE gameplay turns are backend-authoritative. The Next.js backend validates actions, chooses legal targets, hydrates stats, rolls dice, applies mechanics, handles rewards/claims/death/finality, and persists outcomes.',
  'Gameplay operating loop: read visible targets/objectives, choose one legal action, name the target or room feature, declare intent, then let the backend resolve mechanics.',
  `Useful scene action intents: ${WAGDIE_SCENE_ACTION_INTENTS.join(', ')}.`,
  `Useful fixed roll checks when offered: ${WAGDIE_FIXED_ROLL_CHECKS.join(', ')}.`,
  'When asked to take a WAGDIE gameplay turn, respond with only a JSON object using this shape:',
  '{',
  '  "actionType": "attack|defend|help|investigate|negotiate|flee|rest",',
  '  "target": { "kind": "monster", "id": "monster-1" },',
  '  "rollChoice": { "source": "fixed", "checkType": "attack" },',
  '  "publicSpeech": "short public in-character speech",',
  '  "intentSummary": "brief tactical intent"',
  '}',
  'Use only legal targets supplied in the gameplay prompt. Attack requires a monster target; help requires a character target. Omit target for scene actions when no legal target is needed.',
  'rollChoice is optional but recommended when the prompt lists fixed or contextual checks. For contextual checks, use only a supplied contextualCheckId; never invent labels, DCs, dice, or mechanics.',
  'For narrative scene-check prompts, respond with {"publicSpeech":"...","sceneCheckProposal":null} or include sceneCheckProposal with actionIntent, intentSummary, and rollChoice. The backend may ignore, sanitize, or override proposals.',
  'Good publicSpeech is short, in-character, and action-forward. It should not wait for permission; it should commit to a visible target, ally, obstacle, route, or tactic.',
  'Stats, rewards, reward claims, death, and finality are backend-authoritative. Agents and plugin actions may reference supplied context only; they cannot assign stats, rewards, claim status, HP changes, dice results, DCs, or death/finality outcomes.',
].join('\n');

const gameplayContextProvider = {
  name: 'WAGDIE_GAMEPLAY_CONTEXT',
  description: 'Provides WAGDIE gameplay action vocabulary and backend-authoritative turn guidance.',
  position: 50,
  get: async () => ({
    text: GAMEPLAY_CONTEXT_TEXT,
    values: {
      wagdieGameplayActionTypes: WAGDIE_GAMEPLAY_ACTION_TYPES,
      wagdieSceneActionIntents: WAGDIE_SCENE_ACTION_INTENTS,
      wagdieFixedRollChecks: WAGDIE_FIXED_ROLL_CHECKS,
      wagdieGameplayBackendAuthoritative: true,
      wagdieGameMasterNoCharacterDialogue: true,
    },
    data: {
      actionTypes: WAGDIE_GAMEPLAY_ACTION_TYPES,
      sceneActionIntents: WAGDIE_SCENE_ACTION_INTENTS,
      fixedRollChecks: WAGDIE_FIXED_ROLL_CHECKS,
      actionEnvelope: {
        actionType: 'attack|defend|help|investigate|negotiate|flee|rest',
        target: {
          kind: 'monster|character',
          id: 'legal-target-id',
        },
        rollChoice: {
          source: 'fixed|contextual',
          checkType: 'listed-fixed-check-type',
          contextualCheckId: 'offered-contextual-check-id',
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
      narrativeDirectives: {
        gmDoesNotNarrateCharacterDialogue: true,
        watchableBeatMustInclude: [
          'visible change',
          'cost or consequence',
          'clue or reveal',
          'route or obstacle',
          'hard choice',
        ],
        crowsDenAnchors: [
          'black bell',
          'braided rope',
          'rafters',
          'counting shutters',
          'salt threshold',
          'cellar casks',
          'bottle-glass ledger',
          'roof ledger',
        ],
      },
    },
  }),
};

const narrativeContextProvider = {
  name: 'WAGDIE_NARRATIVE_CONTEXT',
  description: 'Provides watchable GM narration rules, Crow\'s Den anchors, and no-character-dialogue constraints.',
  position: 45,
  get: async () => ({
    text: NARRATIVE_DIRECTIVE_TEXT,
    values: {
      wagdieGameMasterNoCharacterDialogue: true,
      wagdieWatchableNarrativeBeats: true,
      wagdieLocation11Focus: 'crows-den',
    },
    data: {
      noCharacterDialogueRule: 'GM narration describes visible action, pressure, and consequence; character agents own character speech.',
      location11Anchors: [
        'black bell',
        'braided rope',
        'rafters',
        'counting shutters',
        'salt threshold',
        'cellar casks',
        'bottle-glass ledger',
        'roof ledger',
        'inner threshold door',
      ],
      watchableBeatChecklist: [
        'visible changed object, route, or threat',
        'specific pressure or cost',
        'clear next choice or action hook',
        'continuity with recent transcript',
        'no quoted or summarized character dialogue',
      ],
    },
  }),
};

async function emitGuidance(
  callback: HandlerCallback | undefined,
  actionName: string,
  text: string
): Promise<void> {
  if (!callback) return;
  await callback({
    text,
    actions: [actionName],
    source: 'wagdie-gameplay-plugin',
  });
}

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
      '{"actionType":"attack|defend|help|investigate|negotiate|flee|rest","target":{"kind":"monster|character","id":"legal-target-id"},"rollChoice":{"source":"fixed","checkType":"attack"},"publicSpeech":"short in-character speech","intentSummary":"brief tactical intent"}',
      'For narrative scene checks, use {"publicSpeech":"short in-character speech","sceneCheckProposal":{"actionIntent":"investigate","intentSummary":"what you try","rollChoice":{"source":"fixed","checkType":"perception"}}} only when the prompt asks for scene-check JSON.',
      'Choose an action that changes the scene: strike a legal monster, protect a named ally, force a route, read a concrete clue, bargain over a visible cost, or flee toward a specific exit.',
      'This plugin does not resolve mechanics or assign stats, rewards, reward claims, HP, dice, DCs, death, or finality; WAGDIE backend validation remains authoritative.',
    ].join('\n');

    await emitGuidance(callback, 'DECLARE_WAGDIE_GAMEPLAY_ACTION', text);

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
          text: '{"actionType":"attack","target":{"kind":"monster","id":"monster-1"},"rollChoice":{"source":"fixed","checkType":"attack"},"publicSpeech":"By ash and oath, I strike!","intentSummary":"Attack the active monster directly."}',
          actions: ['DECLARE_WAGDIE_GAMEPLAY_ACTION'],
        },
      },
    ],
  ],
};

const planSceneBeat = {
  name: 'PLAN_WAGDIE_SCENE_BEAT',
  similes: ['WAGDIE_GM_BEAT', 'PLAN_LOCATION_ROOM_BEAT', 'WATCHABLE_SCENE_BEAT'],
  description:
    'No-op helper for WAGDIE GM scene beats. Produces the JSON beat contract and watchability constraints while preserving character dialogue for character agents.',
  validate: async () => true,
  handler: async (
    _runtime: unknown,
    _message: unknown,
    _state?: unknown,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const text = [
      'Plan a WAGDIE GM beat as JSON only:',
      '{"publicNarration":"visible GM narration or null","speakerInstruction":"private direction for the selected character only","stateSummary":"updated private continuity","currentObjective":"what the room is trying to resolve","openThreads":["unresolved question"],"ttrpgPhase":"story|exploration|threat|aftermath","combatReadiness":"none|foreshadow|ready","threatLevel":0,"requestedGameplayAction":null,"encounterSeed":null,"sceneCheckRequest":null,"adventurePatch":{"currentStakes":"what now matters"},"featuredTokenIds":[123],"selectedSpeakerTokenId":123}',
      'Public narration must make the scene watchable: a visible change, cost, clue, route, obstacle, timer, demand, or hard choice.',
      'Never narrate character dialogue. Do not quote characters or write "X says", "X asks", or "X answers"; give the selected character pressure and let their agent speak.',
      'For Crow\'s Den/location 11, ground the beat in black bell, rafters, shutters, salt threshold, cellar casks, bottle-glass ledger, roof ledger, or the inner threshold door.',
      'Keep requestedGameplayAction null unless the supplied schema/context clearly supports a structured combat handoff.',
    ].join('\n');

    await emitGuidance(callback, 'PLAN_WAGDIE_SCENE_BEAT', text);

    return {
      success: true,
      text,
      values: {
        wagdieGameMasterNoCharacterDialogue: true,
        wagdieLocation11Focus: 'crows-den',
      },
      data: {
        noOp: true,
        backendAuthoritative: true,
        beatChecklist: [
          'visible change',
          'specific cost or clue',
          'clear next choice',
          'private speakerInstruction',
          'no character dialogue in GM narration',
        ],
      },
    };
  },
};

const proposeSceneCheck = {
  name: 'PROPOSE_WAGDIE_SCENE_CHECK',
  similes: ['WAGDIE_SCENE_CHECK', 'DECLARE_SCENE_CHECK', 'PROPOSE_NONCOMBAT_ROLL'],
  description:
    'No-op helper for non-combat WAGDIE scene-check proposals. Uses only offered action intents, fixed checks, or contextual check ids; backend adjudication remains authoritative.',
  validate: async () => true,
  handler: async (
    _runtime: unknown,
    _message: unknown,
    _state?: unknown,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const text = [
      'Propose a WAGDIE non-combat scene check only when the prompt asks for scene-check JSON:',
      '{"publicSpeech":"short in-character action declaration","sceneCheckProposal":{"actionIntent":"inspect|search|examine|decipher|negotiate|protect|force|move","intentSummary":"what changes if this works","rollChoice":{"source":"fixed","checkType":"perception"}}}',
      'Use contextual rollChoice only with an offered contextualCheckId. Never invent contextual ids, DCs, labels, dice, results, HP, rewards, death, or finality.',
      'If the action is not roll-worthy, return {"publicSpeech":"short in-character action declaration","sceneCheckProposal":null}.',
    ].join('\n');

    await emitGuidance(callback, 'PROPOSE_WAGDIE_SCENE_CHECK', text);

    return {
      success: true,
      text,
      values: {
        wagdieSceneActionIntents: WAGDIE_SCENE_ACTION_INTENTS,
        wagdieFixedRollChecks: WAGDIE_FIXED_ROLL_CHECKS,
      },
      data: {
        noOp: true,
        backendAuthoritative: true,
        sceneActionIntents: WAGDIE_SCENE_ACTION_INTENTS,
        fixedRollChecks: WAGDIE_FIXED_ROLL_CHECKS,
      },
    };
  },
};

export const wagdieGameplayPlugin = {
  name: 'wagdie-gameplay-plugin',
  description:
    'Local WAGDIE gameplay and narrative tooling plugin. Provides context plus no-op GM beat, scene-check, and gameplay action helpers; backend stats, rewards, claims, validation, and mechanics remain authoritative.',
  providers: [gameplayContextProvider, narrativeContextProvider],
  actions: [declareGameplayAction, planSceneBeat, proposeSceneCheck],
};

export default wagdieGameplayPlugin;
