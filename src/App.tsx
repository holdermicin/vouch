import { useEffect, useState } from 'react';
import { useWalletConnect } from './hooks/useWalletConnect';
import {
  createMarket,
  impliedYesProbability,
  loadMarkets,
  markSettled,
  recordVote,
  resolveMarket,
  sideTotals,
  type Market,
  type Payout,
  type Side,
} from './lib/market';
import { computeReputation, MIN_STAKE_AGE_DAYS, type ReputationResult } from './lib/reputation';
import { parseAmount, truncate } from './lib/format';
import type { HistoryEntry } from './lib/types';

// Real testnet UCT coinId (lowercase 64-hex) — the SDK requires this exact
// format for `coinId`, not the symbol "UCT". Sourced from the official
// sphere-sdk-connect-example MintPanel presets.
const UCT_COIN_ID = 'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0';
const UCT_DECIMALS = 18;

export default function App() {
  const wallet = useWalletConnect();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [reputation, setReputation] = useState<ReputationResult | null>(null);

  useEffect(() => {
    setMarkets(loadMarkets());
  }, []);

  // Pull real transaction history from the connected wallet to compute reputation.
  useEffect(() => {
    if (!wallet.isConnected) {
      setHistory([]);
      setReputation(null);
      return;
    }
    (async () => {
      try {
        const entries = await wallet.query<HistoryEntry[]>('sphere_getHistory');
        setHistory(entries ?? []);
        setReputation(computeReputation(entries ?? []));
      } catch (err) {
        console.error('Failed to load history for reputation scoring', err);
        setHistory([]);
        setReputation(computeReputation([]));
      }
    })();
  }, [wallet.isConnected]);

  const identityKey = wallet.identity?.nametag || wallet.identity?.chainPubkey || null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vouch</h1>
          <p className="text-sm text-neutral-400">Sybil-resistant prediction markets on Sphere</p>
        </div>
        <ConnectArea wallet={wallet} />
      </header>

      {wallet.isConnected && reputation && (
        <ReputationCard reputation={reputation} identityKey={identityKey} />
      )}

      {wallet.isConnected && (
        <CreateMarketForm
          onCreated={(m) => setMarkets((prev) => [m, ...prev])}
          createdBy={identityKey ?? 'unknown'}
        />
      )}

      <div className="space-y-4 mt-6">
        {markets.length === 0 && (
          <p className="text-neutral-500 text-sm text-center py-12">
            No markets yet. {wallet.isConnected ? 'Create the first one above.' : 'Connect your wallet to get started.'}
          </p>
        )}
        {markets.map((market) => (
          <MarketCard
            key={market.id}
            market={market}
            wallet={wallet}
            identityKey={identityKey}
            history={history}
            reputation={reputation}
            onVoted={(m) => setMarkets((prev) => prev.map((x) => (x.id === m.id ? m : x)))}
            onUpdated={(m) => setMarkets((prev) => prev.map((x) => (x.id === m.id ? m : x)))}
          />
        ))}
      </div>
    </div>
  );
}

function ConnectArea({ wallet }: { wallet: ReturnType<typeof useWalletConnect> }) {
  if (wallet.isAutoConnecting) {
    return <span className="text-xs text-neutral-500">Checking wallet…</span>;
  }
  if (wallet.isConnected) {
    return (
      <div className="text-right">
        <div className="text-sm font-medium">{wallet.identity?.nametag ?? truncate(wallet.identity?.chainPubkey ?? '')}</div>
        <button className="text-xs text-neutral-500 hover:text-neutral-300" onClick={() => wallet.disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <button
      className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2 rounded-full"
      onClick={() => wallet.connect()}
      disabled={wallet.isConnecting}
    >
      {wallet.isConnecting ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}

function ReputationCard({ reputation, identityKey }: { reputation: ReputationResult; identityKey: string | null }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-6 text-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="text-neutral-400">Your voting reputation</span>
        <span className="font-mono text-xs text-neutral-500">{identityKey ? truncate(identityKey) : ''}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500"
            style={{ width: `${Math.round(reputation.reputationMultiplier * 100)}%` }}
          />
        </div>
        <span className="font-semibold">{(reputation.reputationMultiplier * 100).toFixed(0)}%</span>
      </div>
      <p className="text-xs text-neutral-500 mt-2">
        Wallet age: {reputation.walletAgeDays.toFixed(1)}d · {reputation.txCount} past transactions
        {reputation.isBelowMinAge && (
          <span className="text-amber-400"> — below {MIN_STAKE_AGE_DAYS}d minimum, your votes carry reduced weight</span>
        )}
      </p>
    </div>
  );
}

function CreateMarketForm({ onCreated, createdBy }: { onCreated: (m: Market) => void; createdBy: string }) {
  const [question, setQuestion] = useState('');
  const [days, setDays] = useState(7);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-6">
      <p className="text-sm font-medium mb-2">Create a market</p>
      <input
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-2"
        placeholder="Will... happen by...?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-neutral-500">Resolves in</label>
        <input
          type="number"
          min={1}
          className="w-16 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        />
        <span className="text-xs text-neutral-500">days</span>
        <button
          className="ml-auto bg-neutral-100 text-black text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-40"
          disabled={!question.trim()}
          onClick={() => {
            const m = createMarket({
              question: question.trim(),
              createdBy,
              resolveBy: Date.now() + days * 24 * 60 * 60 * 1000,
              coinId: UCT_COIN_ID,
            });
            onCreated(m);
            setQuestion('');
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}

function MarketCard({
  market,
  wallet,
  identityKey,
  history,
  reputation,
  onVoted,
  onUpdated,
}: {
  market: Market;
  wallet: ReturnType<typeof useWalletConnect>;
  identityKey: string | null;
  history: HistoryEntry[];
  reputation: ReputationResult | null;
  onVoted: (m: Market) => void;
  onUpdated: (m: Market) => void;
}) {
  const [stake, setStake] = useState('1');
  const [busy, setBusy] = useState(false);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const totals = sideTotals(market);
  const yesProb = impliedYesProbability(market);
  const alreadyVoted = identityKey ? market.votes.some((v) => v.identityKey === identityKey) : false;
  const isCreator = identityKey === market.createdBy;
  const isExpired = Date.now() > market.resolveBy;

  const vote = async (side: Side) => {
    if (!identityKey || !reputation) return;
    const stakeHuman = Number(stake);
    if (!stakeHuman || stakeHuman <= 0) return;
    setBusy(true);
    try {
      // Real UCT transfer, staked to the market creator's wallet as a trusted
      // custodian until resolve (Sphere has no on-chain escrow contract to
      // hold funds, so v1 relies on creator honesty — see README for the tradeoff).
      // amount must be in base units (smallest unit), per Sphere Connect spec.
      await wallet.intent('send', {
        coinId: market.coinId,
        to: market.createdBy,
        amount: parseAmount(String(stakeHuman), UCT_DECIMALS),
      });
      const updated = recordVote(market.id, identityKey, side, stakeHuman, history);
      if (updated) onVoted(updated);
    } catch (err) {
      console.error('Vote failed', err);
    } finally {
      setBusy(false);
    }
  };

  const resolve = (outcome: Side) => {
    const { market: resolved } = resolveMarket({ ...market }, outcome);
    onUpdated(resolved);
  };

  const sendPayout = async (payout: Payout) => {
    setSendingKey(payout.identityKey);
    try {
      // Autonomous settlement: sent directly peer-to-peer, no custodian in between.
      await wallet.intent('send', {
        coinId: market.coinId,
        to: payout.identityKey,
        amount: parseAmount(String(payout.payoutHuman), UCT_DECIMALS),
      });
      const updated = markSettled(market.id, payout.identityKey);
      if (updated) onUpdated(updated);
    } catch (err) {
      console.error('Settle payout failed', err);
    } finally {
      setSendingKey(null);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
      <div className="flex justify-between items-start gap-3">
        <p className="font-medium">{market.question}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${market.status === 'open' ? 'bg-emerald-900 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>
          {market.status === 'open' ? 'Open' : `Resolved: ${market.outcome}`}
        </span>
      </div>

      <div className="mt-3">
        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500" style={{ width: `${yesProb * 100}%` }} />
          <div className="h-full bg-rose-500" style={{ width: `${(1 - yesProb) * 100}%` }} />
        </div>
        <div className="flex justify-between text-xs text-neutral-500 mt-1">
          <span>YES {(yesProb * 100).toFixed(0)}% · {totals.yesStake} UCT staked</span>
          <span>NO {((1 - yesProb) * 100).toFixed(0)}% · {totals.noStake} UCT staked</span>
        </div>
      </div>

      {market.status === 'open' && wallet.isConnected && !alreadyVoted && (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0.01}
            step="0.01"
            className="w-20 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-sm"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
          <span className="text-xs text-neutral-500">UCT</span>
          <button
            className="ml-auto bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-3 py-1.5 rounded-full disabled:opacity-40"
            disabled={busy}
            onClick={() => vote('YES')}
          >
            Vote YES
          </button>
          <button
            className="bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold px-3 py-1.5 rounded-full disabled:opacity-40"
            disabled={busy}
            onClick={() => vote('NO')}
          >
            Vote NO
          </button>
        </div>
      )}

      {alreadyVoted && market.status === 'open' && (
        <p className="text-xs text-neutral-500 mt-3">You already voted on this market.</p>
      )}

      {market.status === 'open' && isCreator && isExpired && (
        <div className="flex items-center gap-2 mt-3 border-t border-neutral-800 pt-3">
          <span className="text-xs text-neutral-500">Resolve as creator:</span>
          <button className="text-xs bg-emerald-900 text-emerald-300 px-3 py-1 rounded-full" onClick={() => resolve('YES')}>
            YES won
          </button>
          <button className="text-xs bg-rose-900 text-rose-300 px-3 py-1 rounded-full" onClick={() => resolve('NO')}>
            NO won
          </button>
        </div>
      )}

      {market.status === 'resolved' && market.payouts && market.payouts.length > 0 && (
        <div className="mt-3 border-t border-neutral-800 pt-3 space-y-2">
          <p className="text-xs text-neutral-500">
            Winners split the pool proportional to reputation-weighted stake. Settlement is peer-to-peer — no custodian holds the funds.
          </p>
          {market.payouts.map((p) => {
            const isSent = !!market.settled?.[p.identityKey];
            return (
              <div key={p.identityKey} className="flex items-center justify-between text-sm bg-neutral-950 rounded-lg px-3 py-2">
                <span className="font-mono text-xs">{truncate(p.identityKey)}</span>
                <span>{p.payoutHuman.toFixed(2)} UCT</span>
                {isCreator ? (
                  <button
                    className="text-xs bg-neutral-100 text-black px-2 py-1 rounded-full disabled:opacity-40"
                    disabled={isSent || sendingKey === p.identityKey}
                    onClick={() => sendPayout(p)}
                  >
                    {isSent ? 'Sent ✓' : sendingKey === p.identityKey ? 'Sending…' : 'Send'}
                  </button>
                ) : (
                  <span className="text-xs text-neutral-500">{isSent ? 'Sent ✓' : 'Pending'}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
