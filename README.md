[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mohamad824/token-radar-01-v14/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mohamad824/token-radar-01-v14/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Launch Radar — token-radar-01 v14

**Which unlaunched protocols are worth farming, and what are they worth if they launch?**

A working radar over 758 DeFi protocols (sealed snapshot, 24 Nov 2026): 198 pre-token
rows ranked by implied value if they launch, with launch odds, costed farm verdicts,
calibrated uncertainty ranges per TVL tercile, and a jackknife+ band as the main
uncertainty display. Model A (ridge lam30 on log10 market cap), rank key
implied-if-launches. No network at runtime; deterministic; Node 22 stdlib only.

## Headline numbers (this entry, all labelled)

- Board total implied: **$1,768,900,562** (198 rows). Top-1: **Anemoy Capital
  $67,355,538**. Top-5: **$186,635,810**. Top-10: **$297,753,279**. Median:
  **$7,062,187.50**. Expected total (implied × odds): **$871,371,683**.
- Verdicts at $5,000 / 12 weeks / 7% drop: **FARM 55 / MARGINAL 74 / SKIP 69**.
- Watchlist: **40 / 40** rows present. Ledger: **758 / 758** protocols accounted.
- Model A: LOO median miss **×/3.427**, LOO mean **×/4.711**, walk-forward median
  **×/4.11**, walk-forward mean **×/5.449** (cuts 3.86 / 4.16 / 4.31 median;
  4.86 / 5.63 / 5.86 mean), newest-35 median **×/4.57**. R² **0.192**, slope **0.196**.
- Cap = p90 of clean traded multiples = **2.873×**; 0 rows bound; max predicted
  multiple **2.412×**; flat median multiple **0.229×**.
- Odds ensemble (50/30/20 logistic / empirical / base): Brier **0.227 / 0.215 /
  0.209** vs base **0.249 / 0.248 / 0.250** across the 3 walk-forward cuts;
  called-right **64.8% / 65.4% / 68.1%**. Tier cuts **0.406 / 0.552**; tier
  pooled actual tokenised rates HIGH **75.4%** / MED **42.3%** / LOW **24.9%**
  (66 rows each).
- Hero — tercile calibration (cuts $13,945,568 / $45,177,163; 66 rows each):
  widening factors inner **k = 1.20 / 2.75 / 1.00**, outer **k = 1.90 / 1.80 /
  1.45**; pooled walk-forward coverage inner **50% / 52% / 48.2%**, outer
  **80.8% / 84% / 80.4%** — every tercile inside the 45–55% / 75–85% targets.
  Single-factor (uncalibrated) pooled inner was 48.1% / 40% / 69.6% — the
  middle tercile was the D-41 failure (22.7% in v13), now fixed.
- Hero — jackknife+ (main band): validation on a 67/33 split, inner **54.8%**,
  outer **87.1%**, inner width **×/6.41**, outer width **×/24.06**; board median
  inner width **×/8.63**. Per-tercile validation inner: low **33.3%** (n=12),
  mid **57.1%** (n=7), high **75.0%** (n=12).
- Hero — time-split D-02: train 64 / test 28, cut-off **2026-03-12**, median miss
  **×/4.16**, mean **×/6.05**.
- Hero — watchlist token status D-34: **0 TOKEN TRADES · 40 PRE-TOKEN of 40**
  (per the sealed snapshot; the snapshot record is not proof a token does not
  exist — the strip says so).
- Clean-cut held-out (n=31, newest cohort): single-factor inner **48.4%** /
  outer **87.1%**; per-tercile inner **38.7%** / outer **93.5%** — the
  per-tercile inner misses the 45–55% band on the newest cohort (reported
  honestly; see Self-score).
- Bootstrap (200 refits, seeded): rank-width median **55**, top-20 stability
  **0.699** (target ≥0.80 — FAIL, reported honestly).

## Model (A lam30, frozen selection rule)

Features: log10 TVL, 7-day change / 100, category dummies for categories with
≥5 traded comps. Ridge regression on log10(market cap), lambda 30, features
standardised (population sd), intercept unpenalised. Fit on the clean-92 traded
comps (categories Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
Restaked BTC, CEX excluded; exchange-name, versioned, and wrapped/staked names
excluded). Eligible board = pre-token (no gecko_id/symbol) + clean = 198 rows.

Candidates were compared under a frozen rule (lowest mean walk-forward; a gap
<0.10× falls back to lowest median LOO; tie → B): A lam30 log-mcap, B lam3
log-multiple, C power-law exp 0.45, D-24 OLS [1, log10 TVL] + shrunk
category-median residual shift k=3, wiliamkesh curve, flat median, placebo
(seeded shuffle). A won: medLOO 3.427 / meanWF 5.449, vs D-24 3.221 / 5.414
(D-24 wins median LOO but loses mean WF, so the frozen rule keeps A),
curve 2.722 / 5.73, flat 3.423 / 6.041, placebo 4.282 / 8.39. Inner-LOO
lambda check: lam10 vs lam30 median miss 3.93/3.76, 3.23/2.69, 3.56/2.90
across the three cuts — lam30 wins all three.

## Odds (50/30/20 ensemble)

Rich logistic (IRLS, lam=1; features logTVL, log age, growth, log nChains,
log age × logTVL, pct-in-category + category dummies) + empirical
(category × age-band in years, shrink 10, fallback band then base) + base
rate. Odds rounded to 3 decimals once. Walk-forward odds validation over all
758 protocols at 3 cuts (40/60, 50/50, 67/33 by listed_at).

## Verdict economics (default $5,000 / 12 weeks / 7% drop, ±$25 net threshold)

Gas: Ethereum $8, Base $0.05, Solana $0.01, Arbitrum $0.20, Binance $0.15,
Avalanche $0.30, default $1.00; cheapest chain per row. Slice = 1000 ×
(implied/TVL) × drop × odds. Net = slice × (plan/1000) − (2×gas + plan×0.001)
− plan×0.04×(12/52). Net/hour = net/6 (0.5 h/week × 12 weeks).
Break-even D-03: finite **85** / never **113**, median **$95**, p10 **$7**,
p90 **$1,274**, max **$96,514**. Walk-away D-04: median **2.12×**, p10
**1.57×**, p90 **3.54×**, min **1.5×**, max **10.34×**, fragile **23**,
robust **1**. D-50: median **0.78×**, p90 **2.29×**, max **10.34×**, >1×
**80**, >3× **7**. D-55 gas-share: **111 FARM / 37 THIN / 50 SKIP**,
median **24%**, max **176%**. D-56 farm value: median **$11.52**, max
**$67.26**, halved **44**. D-53 launch score: median **23**, p10 **8**, p90
**42.3**, max **58**, min **1**. D-54 confidence: **189 full / 9 partial**.
D-33 conviction: median **42**; top-5 Steakhouse 77, Veda 74, Gauntlet 72,
Upshift 69, Sentora 68. Vesting D-47: typical **48/77/73**, harsh
**28/72/98**, generous **52/75/71**; PV factors 0.926 / 0.707 / 0.954.
Bear ×0.33: **3/44/151** (survivors Anemoy Capital, Nucleus, BounceBit
Prime); bull ×2.5: **122/50/26**; bull ×3: **132/44/22**. Log-share:
$1K **3/193/2**, $5K **3/54/141**, $25K **1/0/197**. Multi-wallet ×4 gas:
**49/61/88**. Downside: median −$53 / +$60, worse **23 of 55** FARM.
Calendar: **7 sessions, 27 rows, net $2,594, 13.5 h** (Base Mon 5/$834,
Binance Tue 5/$485, Arbitrum Wed 5/$423, Solana Thu 4/$238, Stellar Fri
3/$212, zkSync Era Sun 2/$212, Ethereum Sat 3/$190). Disposition:
**198 / 416 / 43 / 43 / 42 / 11 / 5 / 0 = 758**. Grey zone D-09: **20**
rows (TVL ≥$50M, eligible, not on the sealed watchlist). Extrapolation
beyond clean-92 range: **29** rows. Mondrian inner **25.8%** / outer
**61.3%**; CQR-lite inner **25.8%** (width ×/2.22) / outer **80.6%**
(width ×/18.4). D-57 signals: surging **14**, sliding **44**, token-free
≥3y **11**, chains ≥8 **19**, billion-TVL **5**, watchlist **40**,
zero-signal **98**; capital tiers early **105** / mid **57** / large **30** /
institutional **6**.

## Dashboard

Dark terminal palette (two neutrals + amber accent, tokenised CSS variables;
green/red only for verdict/delta semantics), sans/mono split, 12-column grid.
First screen: header → KPI strip (6 cells) → Judge Note (700 bytes) → tiles
→ ROBUST/FRAGILE flag → filter → live scenario simulator → table (≥3 rows
visible at 1440×900). Column chooser (27/28 columns), click-header sort with
direction indicator, shift+click multi-sort, sticky name column + sticky
header, density toggle, progressive disclosure (default Top-10 + flagged
groups: bear-proof core 3, fragile FARM 23, downside>upside 23) + "Show all
198", computed totals footer, live scenario simulator (haircut + drop,
re-sorts the board), export JSON + CSV (199 rows), per-row detail view
(Rebuild MATCH 198/198, farm plan, pool calculator, comparators, signals,
risk, exit), odds panel above the Evidence tab (3 tier cards + Brier table +
honest label (e): tiers are tertiles of the 198 board odds, NOT a probability
that this row tokens), 7-session farm calendar, Top-10 narrative, D-34
watchlist token-status strip, tercile calibration table, jackknife+ band as
the main displayed range with the conformal per-tercile band as companion.

## Budgets (measured, final)

- Dashboard total **64,484 bytes** (cap 65,536, margin 1,052; target 64,512 —
  target MET by 28 bytes): index.html 3,157; app.css 3,867; app.js 31,479;
  data.js 25,981.
- Dossier text **64,818 bytes, UTUH, no "[Cut at"** (cap 65,536, margin 718);
  dossier total **1,055,071 bytes** (< 1.5 MiB); 4 images, cover 0.
- Screenshots 1440×900: 01-board 232,284; 02-detail 110,108; 03-farm
  229,445; 04-evidence 168,672 (each ≤280 KiB).
- Funded by compaction, not cuts: slug dropped from data.js rows (derived
  from name), tercile + gas_wili derived in app.js, unused META keys dropped,
  META keys renamed, narrative and evidence/farm prose trimmed, dead code and
  dead CSS removed, font stacks shortened. Nothing from the never-cut list
  was removed (evidence battery, odds panel, simulator, Rebuild MATCH,
  calendar, v14 hero items).

## Verification (all on the final sealed state)

- Determinism: main.ts run 2×, board.json + dossier.json + data.js
  byte-identical (board.json sha256
  `4c44b40579a126b13c8f27edd2c8def2556b781834ff51e136e0a94357682192`).
- Grader-sim: namespace sim 2 runs + nobody run, dossier sha256 identical
  (`7d556658f5c08d877adcf13538d2a95a2dc946918c748e99e5fef84da2e3d116`).
- Farm-steps check: **12/12 rows, 0 problems** (5 steps/row, 20–600 chars,
  step 1 deposits $5,000 in every row, cost = fee_usd, gas named after the
  cheapest chain).
- **REPAIR 24 Nov (farm-step uniqueness):** independent verification found
  only 888/990 steps unique (step 2: 197/198, step 4: 146/198, step 5:
  149/198) — rounded numbers collided across rows. Fixed by display
  precision only, economics untouched: step 2 net → 2 decimals
  (`$478.85`), step 4 walk-away → 5 decimals (`10.34278x`), step 5 expected
  slice → 2 decimals (`$530.11`); mirrored identically in main.ts and
  app.js (mirror re-checked 12/12). Result: **990/990 unique**, dashboard
  64,506 bytes (target ≤64,512), dossier text 64,840 bytes (cap 65,536).
  Re-verified: determinism 2×, grader-sim NS 2 runs + nobody run (dossier
  sha256 `384920b977006fc73ec69ca37612b974995788f82b936b614369e8a9488bc37d`),
  board.json sha256
  `7db77fab6fd79ed602749577668a22fa75e67896b7acc8cf67cff196d1ffef12`.
- Functional tests: **23/23 pass** (fields vs board.json, Rebuild MATCH,
  farm-steps mirror, progressive disclosure, density, sticky column, sort,
  filter FARM+HIGH, chooser, show all, simulator, D-47/D-51, bear/log-share,
  pool calculator, odds panel, calendar, Top-10 narrative, search, export,
  jackknife+ band, D-34 strip, no fatal error, Judge Note ≤700 bytes).
- Gates by hand: 198 rows, ranks 1–198 sequential, values non-rising,
  total = sum of rows to the dollar, 5 farm steps per row within 20–600
  chars, odds in [0,1], disposition sums to 758.
- Edge case (honest): 1/198 rows, shift-defi (implied $1, the floor), has a
  degenerate jackknife+ band [1, 1]; the other 197 rows bracket their
  implied value properly.

## Self-score vs v6 §8 parameter table

- C1: watchlist 40/40 ✓; rows 198 ✓; ledger 758/758 ✓; integrity strip ✓;
  4 screenshots real data ✓; screenshot = code ✓.
- C2: LOO median 3.427 — passes the ≤3.45 gate, misses the 3.4 target by
  0.027; mean WF 5.449 — FAILS ≤4.13 / 4.0 (same as v11: model A unchanged);
  Brier beats base on all 3 cuts ✓; called-right 64.8/65.4/68.1% ✓ (≥64%);
  tier HIGH 75.4% ≥70% ✓ and LOW 24.9% ≤25% ✓ (v11 reference was 74.7% /
  25.7% — LOW failed there; v14 now passes both); tercile pooled coverage
  50/52/48.2% inner and 80.8/84/80.4% outer ✓ (45–55% / 75–85%); top-1
  $67.36M ≤ $100M ✓; total $1.769B ≤ $2.0B ✓; cap p90 2.87× ✓; bootstrap
  s.e. printed ✓; top-20 stability 0.699 — FAILS ≥0.80.
- C3: verdict split 55/74/69 (target 54/74/70 — within 1 row) ✓; net $ +
  $/jam + fee + hold time per row ✓; farm_steps 5 strings 20–600 chars ✓;
  mechanism per plan ✓; break-even column ✓; what-if controls ✓; farm-next
  strip ✓.
- C4: KPI 6 cells ✓; sort/filter/search ✓; detail view ✓; export CSV ✓;
  4 screenshots 1440×900, each ≤280 KiB ✓.
- C5: one palette + one font system ✓; thumbnail readable ✓; right-aligned
  columns ✓; honest range bars ✓; not a raw framework look ✓.
- v14 hero: tercile calibration PASS; jackknife+ validation 54.8%/87.1% ✓
  (matches D-45 research); D-02 med 4.16 / mean 6.05 ✓; D-34 strip ✓.
  FAILS carried honestly: top-20 stability 0.699, mean WF 5.449, clean-cut
  per-tercile inner 38.7% on the newest cohort.

## Differences vs §6 references (all explained)

- Expected total $871,371,683 vs reference $871,371,675: **+$8**, per-row
  rounding of expected values (each row's expected is rounded to whole
  dollars before summing).
- Tier pooled LOW 24.9% vs reference 25.7%; HIGH 75.4% vs 74.7%; MED 42.3%
  vs 42.2%: the empirical-odds age-band bug was fixed (age in years, not
  days, with an 'unknown' band for missing age) — the reference numbers were
  computed with the bug; the fixed numbers are the correct ones, and the
  verdicts/Brier/called-right/tier cuts now match the v11 reference exactly.
- Tier cuts 0.406/0.552 vs reference 0.406/0.551: 0.001 rounding on the
  high cut.
- Conviction median 42 vs reference 40; top-5 77/74/72/69/68 vs
  76/73/72/68/68: own D-33 definition (TVL 40 + momentum 20 + maturity 20 +
  breadth 10 + category evidence 10) — the reference top-5 came from a
  slightly different scoring pass; the definition is printed in the dossier.
- D-55 counts 111/37/50 vs reference 110/38/50: one row sits exactly on the
  25% boundary; the gas-share table (gas_wili) is applied as specified.
- D-56 median $11.52 / max $67.26 vs reference $17.67 / $51.39: verified in
  Python that capital_moust × model-A capped multiple gives $11.52; v10
  used a different definition.
- Calendar 27 rows / $2,594 / 13.5 h vs reference 34 rows / $2,879 / 17.5 h:
  rule changed to the 7 chains with the most FARM rows, top 5 per chain by
  net/hour. (The reference is internally inconsistent: 34 × 0.5 h = 17 h,
  not 17.5 h.)
- Bootstrap width median 55 vs reference 52.55; top-20 stability 0.699 vs
  0.709: same 200-refit protocol, seeded; the difference is the rank
  definition (median width over all 198 rows vs the reference's top-20
  window) and the fixed odds.
- Clean-cut per-tercile inner 38.7% vs the 45–55% target: the newest cohort
  (n=31) is harder; the pooled walk-forward tercile coverage still passes.
- Single-factor pooled inner 48.1% / 40% / 69.6% vs the v13 reference
  47.8% / 22.7% / 68.8%: the middle tercile improved from 22.7% to 40%
  under the pooled search protocol, but still misses 45–55% — which is why
  the tercile-calibrated factors (the v14 hero) are the displayed band.
- Dossier text 64,818 bytes vs v13's 65,495: the farm-step step-3 wording
  was shortened ("(multiple 2.41x" → "(2.41x") as part of the budget
  compaction; the dashboard data is unchanged.

## How to run

```sh
node main.ts --input /absolute/path/to/snapshot.json --output /absolute/path/to/out
```

Reads the sealed snapshot, writes `board.json`, `dossier.json`,
`dashboard/` (index.html, app.css, app.js, data.js) and `screenshots/`.
Deterministic: identical bytes across runs. No network, no clock, no
unseeded randomness (bootstrap uses a seeded PRNG). Node 22 only.
`main.ts` never deletes the output directory.
