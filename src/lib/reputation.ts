import type { HistoryEntry } from './types';

/**
 * Reputation model for Vouch.
 *
 * Goal: make sybil attacks (spinning up many fresh wallets to fake consensus)
 * economically and time-costly, without excluding genuine new users entirely.
 *
 * We do NOT claim this proves "one human = one vote". A wallet address is a
 * cryptographic identity, not a human identity — anyone can create more.
 * What this DOES do: it ties voting power to real, hard-to-fake signals
 * (wallet age + transaction history) pulled straight from Sphere via
 * `sphere_getHistory`, so faking influence requires real time and real UCT,
 * proportional to how much influence is being faked.
 */

export interface ReputationResult {
  walletAgeDays: number;
  txCount: number;
  ageMultiplier: number; // 0 -> 1, ramps up over MIN_STAKE_AGE_DAYS
  activityMultiplier: number; // small bonus for having real history
  reputationMultiplier: number; // final multiplier applied to stake
  isBelowMinAge: boolean;
}

/** Wallets younger than this get a reduced (not zero) voting weight. */
export const MIN_STAKE_AGE_DAYS = 7;

/** Multiplier floor for brand-new wallets — never fully zero, so genuine new users can still participate. */
const MIN_AGE_MULTIPLIER = 0.1;

/** Extra weight cap from transaction history, on top of the age multiplier. */
const MAX_ACTIVITY_BONUS = 0.25;
const ACTIVITY_BONUS_TX_THRESHOLD = 10; // txs needed to hit the full activity bonus

export function computeReputation(history: HistoryEntry[]): ReputationResult {
  const txCount = history.length;

  const earliestTimestamp =
    txCount > 0 ? Math.min(...history.map((h) => h.timestamp)) : Date.now();

  const walletAgeDays = Math.max(0, (Date.now() - earliestTimestamp) / (1000 * 60 * 60 * 24));

  const ageProgress = Math.min(1, walletAgeDays / MIN_STAKE_AGE_DAYS);
  const ageMultiplier = MIN_AGE_MULTIPLIER + ageProgress * (1 - MIN_AGE_MULTIPLIER);

  const activityProgress = Math.min(1, txCount / ACTIVITY_BONUS_TX_THRESHOLD);
  const activityMultiplier = activityProgress * MAX_ACTIVITY_BONUS;

  const reputationMultiplier = Math.min(1, ageMultiplier + activityMultiplier);

  return {
    walletAgeDays,
    txCount,
    ageMultiplier,
    activityMultiplier,
    reputationMultiplier,
    isBelowMinAge: walletAgeDays < MIN_STAKE_AGE_DAYS,
  };
}

/** Effective voting weight = raw stake (human units) x reputation multiplier. */
export function effectiveWeight(stakeHuman: number, reputation: ReputationResult): number {
  return stakeHuman * reputation.reputationMultiplier;
}
