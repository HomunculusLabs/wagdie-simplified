import type { GameplayDiceRollResult } from './types'

export type GameplayRandomSource = () => number

export const SUPPORTED_DICE_FORMULAS = ['d20', '1d4', '1d6', '1d8', '2d6'] as const
export type SupportedDiceFormula = typeof SUPPORTED_DICE_FORMULAS[number]

const FORMULA_PATTERN = /^(?:(\d+)?)d(4|6|8|20)$/

export class GameplayDiceFormulaError extends Error {
  constructor(formula: string) {
    super(`Unsupported gameplay dice formula: ${formula}`)
    this.name = 'GameplayDiceFormulaError'
  }
}

export function isSupportedDiceFormula(formula: string): formula is SupportedDiceFormula {
  return (SUPPORTED_DICE_FORMULAS as readonly string[]).includes(formula)
}

export function parseDiceFormula(formula: string): { count: number; sides: number; formula: SupportedDiceFormula } {
  const normalized = formula.trim().toLowerCase()
  if (!isSupportedDiceFormula(normalized)) {
    throw new GameplayDiceFormulaError(formula)
  }

  const match = normalized.match(FORMULA_PATTERN)
  if (!match) {
    throw new GameplayDiceFormulaError(formula)
  }

  return {
    count: match[1] ? Number(match[1]) : 1,
    sides: Number(match[2]),
    formula: normalized,
  }
}

export function rollDie(sides: number, rng: GameplayRandomSource = Math.random): number {
  if (!Number.isInteger(sides) || sides < 2) {
    throw new Error('Dice sides must be an integer greater than one')
  }

  const raw = rng()
  const normalized = Number.isFinite(raw) ? Math.min(0.999999999999, Math.max(0, raw)) : 0
  return Math.floor(normalized * sides) + 1
}

export function rollDiceFormula(
  formula: SupportedDiceFormula | string,
  rng: GameplayRandomSource = Math.random
): GameplayDiceRollResult {
  const parsed = parseDiceFormula(formula)
  const rolls = Array.from({ length: parsed.count }, () => ({
    sides: parsed.sides,
    value: rollDie(parsed.sides, rng),
  }))

  return {
    formula: parsed.formula,
    rolls,
    total: rolls.reduce((sum, roll) => sum + roll.value, 0),
  }
}
