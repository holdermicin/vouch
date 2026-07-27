import { computeReputation, effectiveWeight, type ReputationResult } from './reputation';
import type { HistoryEntry } from './types';

export type Side = 'YES' | 'NO';

export interface Vote {
  identityKey: string; // wallet nametag or chainPubkey — one vote per identityKey per market
  side: Side;
  stakeHuman: number; // human-readable UCT amount staked
  reputation: ReputationResult;
  weight: number; // effectiveWeight(stake, reputation)
  timestamp: number;
}

export interface Market {
  id: string;
  question: string;
  createdBy: string;
  createdAt: number;
  resolveBy: number; // timestamp
  coinId: string;
  status: 'open' | 'resolved';
  outcome?: Side;
  votes: Vote[];
  payouts?: Payout[];
  settled?: Record<string, boolean>; // identityKey -> sent
}

const STORAGE_KEY = 'vouch:markets:v1';

export function loadMarkets(): Market[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Market[]) : [];
  } catch {
    return [];
  }
}

export function saveMarkets(markets: Market[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(markets));
}

export function createMarket(params: {
  question: string;
  createdBy: string;
  resolveBy: number;
  coinId: string;
}): Market {
  const market: Market = {
    id: crypto.randomUUID(),
    question: params.question,
    createdBy: params.createdBy,
    createdAt: Date.now(),
    resolveBy: params.resolveBy,
    coinId: params.coinId,
    status: 'open',
    votes: [],
  };
  const markets = loadMarkets();
  markets.unshift(market);
  saveMarkets(markets);
  return market;
}

/** Returns null if this identity already voted on this market (sybil guard #1: no double-voting same wallet). */
export function recordVote(
  marketId: string,
  identityKey: string,
  side: Side,
  stakeHuman: number,
  history: HistoryEntry[],
): Market | null {
  const markets = loadMarkets();
  const market = markets.find((m) => m.id === marketId);
  if (!market || market.status !== 'open') return null;

  const alreadyVoted = market.votes.some((v) => v.identityKey === identityKey);
  if (alreadyVoted) return null;

  const reputation = computeReputation(history);
  const weight = effectiveWeight(stakeHuman, reputation);

  market.votes.push({
    identityKey,
    side,
    stakeHuman,
    reputation,
    weight,
    timestamp: Date.now(),
  });

  saveMarkets(markets);
  return market;
}

export interface SideTotals {
  yesStake: number;
  noStake: number;
  yesWeight: number;
  noWeight: number;
}

export function sideTotals(market: Market): SideTotals {
  return market.votes.reduce<SideTotals>(
    (acc, v) => {
      if (v.side === 'YES') {
        acc.yesStake += v.stakeHuman;
        acc.yesWeight += v.weight;
      } else {
        acc.noStake += v.stakeHuman;
        acc.noWeight += v.weight;
      }
      return acc;
    },
    { yesStake: 0, noStake: 0, yesWeight: 0, noWeight: 0 },
  );
}

/** Implied probability of YES, based on reputation-weighted stake (not raw stake). */
export function impliedYesProbability(market: Market): number {
  const { yesWeight, noWeight } = sideTotals(market);
  const total = yesWeight + noWeight;
  if (total === 0) return 0.5;
  return yesWeight / total;
}

export interface Payout {
  identityKey: string;
  stakeHuman: number;
  weight: number;
  shareOfPool: number; // 0..1
  payoutHuman: number; // total UCT this identity receives (their stake back + share of losing pool)
}

/**
 * Winners split the ENTIRE pool (both sides' stake) proportional to their
 * reputation-weighted stake among winners. This rewards early, well-reputed,
 * correct voters more than late, low-reputation, correct voters — on top of
 * simply being right.
 */
export function resolveMarket(market: Market, outcome: Side): { market: Market; payouts: Payout[] } {
  market.status = 'resolved';
  market.outcome = outcome;

  const totals = sideTotals(market);
  const totalPoolStake = totals.yesStake + totals.noStake;
  const winners = market.votes.filter((v) => v.side === outcome);
  const winningWeight = winners.reduce((sum, v) => sum + v.weight, 0);

  const payouts: Payout[] = winners.map((v) => {
    const shareOfPool = winningWeight > 0 ? v.weight / winningWeight : 0;
    return {
      identityKey: v.identityKey,
      stakeHuman: v.stakeHuman,
      weight: v.weight,
      shareOfPool,
      payoutHuman: shareOfPool * totalPoolStake,
    };
  });

  market.payouts = payouts;
  market.settled = {};

  const markets = loadMarkets();
  const idx = markets.findIndex((m) => m.id === market.id);
  if (idx >= 0) markets[idx] = market;
  saveMarkets(markets);

  return { market, payouts };
}

/** Marks a winner's payout as sent, persisted so the "Send" button reflects state after reload. */
export function markSettled(marketId: string, identityKey: string): Market | null {
  const markets = loadMarkets();
  const market = markets.find((m) => m.id === marketId);
  if (!market) return null;
  market.settled = { ...(market.settled ?? {}), [identityKey]: true };
  saveMarkets(markets);
  return market;
}
