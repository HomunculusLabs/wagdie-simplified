import type { PublicLocationRoomGameplayRolls } from '@/lib/eliza/locationRooms/types';
import { formatStatusLabel } from './locationRoomPresentation';

interface StructuredRollPanelProps {
  rolls?: PublicLocationRoomGameplayRolls | null;
  variant?: 'roomy' | 'compact';
}

function actorLabel(actor: { name: string | null; tokenId?: number | null; id: string | null }): string {
  if (actor.name) return actor.name;
  if (actor.tokenId != null) return `#${actor.tokenId}`;
  return actor.id ?? 'Unknown';
}

function rollLabel(roll: { formula: string | null; total: number | null } | null | undefined): string {
  if (!roll) return 'No roll';
  if (roll.formula && roll.total != null) return `${roll.formula} → ${roll.total}`;
  if (roll.total != null) return String(roll.total);
  return roll.formula ?? 'Roll unavailable';
}

function actionCheckLabel(action: PublicLocationRoomGameplayRolls['action']): string {
  return action.checkLabel?.trim()
    || (action.checkType ? formatStatusLabel(action.checkType) : '')
    || formatStatusLabel(action.actionType);
}

function sceneActionIntent(rolls: PublicLocationRoomGameplayRolls): string {
  return rolls.sceneCheck?.actionIntent?.trim()
    || rolls.action.actionType;
}

export function StructuredRollPanel({ rolls, variant = 'roomy' }: StructuredRollPanelProps) {
  if (!rolls) return null;

  const isCompact = variant === 'compact';
  const isSceneCheck = rolls.rollContext === 'scene_check';
  const action = rolls.action;
  const target = action.target ? actorLabel(action.target) : 'No target';
  const checkLabel = actionCheckLabel(action);
  const statusBadge = isSceneCheck ? 'Scene check' : formatStatusLabel(rolls.encounterStatusAfter);

  return (
    <section
      aria-label={isSceneCheck ? 'Structured scene check roll' : 'Structured GM rolls'}
      className={isCompact
        ? 'rounded-md border border-neutral-700/70 bg-black/25 p-2.5 text-xs'
        : 'rounded-xl border border-neutral-700/80 bg-black/30 p-4 text-sm shadow-inner'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-eskapade text-xs uppercase tracking-[0.22em] text-rose-200/80">
            {isSceneCheck ? 'Scene check roll' : 'Structured rolls'}
          </p>
          <p className={isCompact ? 'mt-1 font-eskapade text-neutral-200' : 'mt-1 font-display text-xl lowercase text-neutral-100'}>
            {checkLabel}
          </p>
        </div>
        <div className="rounded-full border border-neutral-700 bg-neutral-950/80 px-3 py-1 font-eskapade text-xs text-neutral-300">
          {statusBadge}
        </div>
      </div>

      <div className={isCompact ? 'mt-2 space-y-1.5 font-eskapade text-neutral-400' : 'mt-4 grid gap-3 font-eskapade text-neutral-300 md:grid-cols-2'}>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
          <p className="text-xs uppercase tracking-widest text-neutral-500">{isSceneCheck ? 'Scene check' : 'Check'}</p>
          <p className="mt-1 text-neutral-200">
            {actorLabel(action.actor)} → {target}
          </p>
          {action.checkSource && (
            <p className="mt-1 text-neutral-500">
              {isSceneCheck
                ? `${formatStatusLabel(action.checkSource)} scene check · intent ${formatStatusLabel(sceneActionIntent(rolls))}`
                : `${formatStatusLabel(action.checkSource)} check · action ${formatStatusLabel(action.actionType)}`}
            </p>
          )}
          <p className="mt-1 text-neutral-400">
            {rollLabel(action.roll)}
            {action.modifier != null ? ` · modifier ${action.modifier >= 0 ? '+' : ''}${action.modifier}` : ''}
            {action.dc != null ? ` · DC ${action.dc}` : ''}
          </p>
          <p className="mt-1 text-neutral-500">
            {isSceneCheck ? 'Scene total' : 'Total'} {action.total ?? '—'} · {formatStatusLabel(action.tier)}
          </p>
        </div>

        {rolls.retaliation && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-3">
            <p className="text-xs uppercase tracking-widest text-red-200/70">Retaliation</p>
            <p className="mt-1 text-red-100">
              {actorLabel(rolls.retaliation.actor)} → {rolls.retaliation.target ? actorLabel(rolls.retaliation.target) : 'Unknown'}
            </p>
            <p className="mt-1 text-red-100/75">
              Attack {rollLabel(rolls.retaliation.attackRoll)}
              {rolls.retaliation.targetAc != null ? ` vs AC ${rolls.retaliation.targetAc}` : ''}
              {rolls.retaliation.hit != null ? ` · ${rolls.retaliation.hit ? 'Hit' : 'Miss'}` : ''}
            </p>
            <p className="mt-1 text-red-100/75">
              {rolls.retaliation.summary || `Damage ${rollLabel(rolls.retaliation.damageRoll)}`}
            </p>
          </div>
        )}
      </div>

      {rolls.publicEffects.length > 0 && (
        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
          <p className="font-eskapade text-xs uppercase tracking-widest text-neutral-500">{isSceneCheck ? 'Scene effects' : 'Public effects'}</p>
          <ul className="mt-2 space-y-1.5 font-eskapade text-neutral-300">
            {rolls.publicEffects.map((effect, index) => (
              <li key={`${effect.kind}-${index}`} className="flex gap-2">
                <span className="text-soul-accent/70">•</span>
                <span>
                  <span className="text-neutral-200">{formatStatusLabel(effect.kind)}</span>
                  {effect.target ? ` on ${actorLabel(effect.target)}` : ''}
                  {effect.amount != null ? ` (${effect.amount})` : ''}
                  {effect.status ? ` · ${formatStatusLabel(effect.status)}` : ''}
                  {effect.summary ? ` — ${effect.summary}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rolls.deaths.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 font-eskapade text-red-100">
          <p className="text-xs uppercase tracking-widest text-red-200/80">Deaths</p>
          <ul className="mt-2 space-y-1.5">
            {rolls.deaths.map((death, index) => (
              <li key={`${death.target.id ?? death.target.tokenId ?? 'death'}-${index}`}>
                {actorLabel(death.target)} — {death.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
