# Vouch — Sybil-resistant prediction markets on Sphere

## Cara jalanin

```bash
npm install
npm run dev
```

Buka di browser (idealnya di dalam Sphere iframe / dengan Sphere extension biar wallet connect kedetect).

## Deploy ke Vercel

```bash
npm run build
```
lalu push ke GitHub dan import project-nya di vercel.com (workflow sama kayak project-project lo sebelumnya).

## Struktur

- `src/hooks/useWalletConnect.ts` — reuse langsung dari sphere-sdk-connect-example resmi
- `src/lib/reputation.ts` — logic Min Stake Age + Reputation Weighting
- `src/lib/market.ts` — create market, record vote (sybil guard: satu identity satu vote), resolve & hitung payout
- `src/App.tsx` — UI: connect, reputation card, create market, vote, resolve, payout modal

## Catatan jujur / batasan MVP ini

1. **Storage market masih localStorage** (per-browser, belum shared antar user). Buat demo solo itu cukup, tapi kalau mau orang lain bisa lihat & vote di market yang sama, perlu backend kecil (bisa pakai Supabase kayak project lo yang lain) buat nyimpen market + votes secara shared.
2. **Reputation model ini mitigasi, bukan solusi sempurna** — sybil masih mungkin secara teknis, tapi jadi costly secara waktu (min 7 hari) dan modal. Ini dijelasin apa adanya di UI (badge "below Nd minimum").
3. **Resolve masih manual oleh creator** (klik YES/NO menang) — bukan oracle otomatis. Buat pitch, ini bisa dibilang "v1 pakai trusted creator resolution, roadmap ke oracle/multi-resolver".
4. Belum pernah dites connect ke wallet Sphere beneran (gue gak punya akses extension-nya) — tapi seluruh API call (`sphere_getHistory`, `sphere_getIdentity` via `wallet.identity`, `intent('send')`) ditarik langsung dari dokumentasi resmi sphere-sdk-connect-example, bukan dikarang.
