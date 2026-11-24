// token-radar-01 v14 — KALIBRASI + BUKTI (alur C1+C2).
// Model board: A ridge lam30 log10(mcap), clean-92 fit, cap p90 2.87x.
// Rank: implied-if-launches. Hero v14: range TERKALIBRASI PER TERCILE TVL
// (3 faktor pelebaran, satu per tercile) + jackknife+ sebagai band utama
// + validasi time-split D-02 + strip status token watchlist D-34.
// Node 22 stdlib only, erasable TS, deterministic, no network.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE = process.argv;
function argVal(flag: string): string | null {
  const i = NODE.indexOf(flag);
  return i >= 0 && i + 1 < NODE.length ? NODE[i + 1] : null;
}
const inputArg = argVal('--input');
const outputArg = argVal('--output');
const INPUT = inputArg ? (isAbsolute(inputArg) ? inputArg : resolve(HERE, inputArg)) : '/input/snapshot.json';
const OUTPUT = outputArg ? (isAbsolute(outputArg) ? outputArg : resolve(HERE, outputArg))
  : (process.env.MAKEFUN_OUTPUT_DIR ? process.env.MAKEFUN_OUTPUT_DIR : '/output');
const SNAP = JSON.parse(readFileSync(INPUT, 'utf8'));
const PROTO = SNAP.protocols;
const WATCH = new Set<string>(SNAP.watchlist);
const AS_OF = new Date(SNAP.as_of + 'T00:00:00Z');
const DAY = 86400000;

// ---------- small numeric helpers (deterministic, no unseeded randomness) ----------
function log10(x: number): number { return Math.log(x) / Math.LN10; }
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n === 0 ? 0 : (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2);
}
function quantile(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  if (n === 0) return 0;
  if (n === 1) return s[0];
  const h = p * (n - 1);
  const lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}
function mean(a: number[]): number { return a.reduce((s, x) => s + x, 0) / Math.max(1, a.length); }
function roundN(x: number, d: number): number { const f = 10 ** d; return Math.round(x * f) / f; }
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Gaussian elimination with partial pivoting (deterministic).
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}
function ridgeFit(X: number[][], y: number[], lam: number): { b: number[]; mu: number[]; sd: number[] } {
  const n = X.length, d = X[0].length;
  const mu = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (let j = 0; j < d; j++) { mu[j] = mean(X.map(r => r[j])); }
  for (let j = 0; j < d; j++) {
    sd[j] = Math.sqrt(mean(X.map(r => (r[j] - mu[j]) ** 2))) || 1;
  }
  const p = d + 1;
  const A: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const v: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const z = [1, ...X[i].map((x, j) => (x - mu[j]) / sd[j])];
    for (let a = 0; a < p; a++) { v[a] += z[a] * y[i]; for (let b2 = 0; b2 < p; b2++) A[a][b2] += z[a] * z[b2]; }
  }
  for (let a = 1; a < p; a++) A[a][a] += lam;
  return { b: solve(A, v), mu, sd };
}
function ridgePred(m: { b: number[]; mu: number[]; sd: number[] }, X: number[][]): number[] {
  return X.map(r => {
    let s = m.b[0];
    for (let j = 0; j < r.length; j++) s += m.b[j + 1] * (r[j] - m.mu[j]) / m.sd[j];
    return s;
  });
}
const factor = (err: number[]): number => 10 ** mean(err.map(e => Math.abs(e)));
const factorMed = (err: number[]): number => 10 ** median(err.map(e => Math.abs(e)));

// ---------- snapshot plumbing ----------
const EXCL_CAT = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCH = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const VERS = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAP = /\b(wrapped|staked|staking)\b/i;
function clean(p: any): boolean {
  return !EXCL_CAT.has(p.category) && !EXCH.test(p.name) && !VERS.test(p.name) && !WRAP.test(p.name);
}
function ageDays(p: any): number | null {
  if (!p.listed_at) return null;
  return Math.max(1, Math.round((AS_OF.getTime() - new Date(p.listed_at + 'T00:00:00Z').getTime()) / DAY));
}
function ageYears(p: any): number { const d = ageDays(p); return d === null ? MED_AGE : d / 365.25; }
const ALL_AGES = PROTO.map(ageDays).filter((a: number | null) => a !== null) as number[];
const MED_AGE = median(ALL_AGES.map(a => a / 365.25));
const TRADED_ALL = PROTO.filter((p: any) => p.mcap_usd && p.mcap_usd > 0 && p.tvl_usd > 0);
const TRADED = TRADED_ALL.filter(clean); // clean-92 fit set
const PRETOKEN = PROTO.filter((p: any) => !p.gecko_id && !p.symbol);
const ELIG = PRETOKEN.filter(clean); // 198 board rows
const CATN: Record<string, number> = {};
for (const p of TRADED) CATN[p.category || 'none'] = (CATN[p.category || 'none'] || 0) + 1;
const TOPCATS = Object.keys(CATN).filter(c => c !== 'none' && CATN[c] >= 5).sort();
function feats(p: any): number[] {
  const x = [log10(p.tvl_usd), (p.change_7d || 0) / 100];
  for (const c of TOPCATS) x.push(p.category === c ? 1 : 0);
  return x;
}
function pctInCat(p: any): number {
  const same = PROTO.filter((q: any) => q.category === p.category).map((q: any) => q.tvl_usd).sort((a: number, b: number) => a - b);
  if (same.length <= 1) return 0;
  return same.indexOf(p.tvl_usd) / (same.length - 1);
}
const Y = TRADED.map((p: any) => log10(p.mcap_usd));
const YMULT = TRADED.map((p: any) => log10(p.mcap_usd / p.tvl_usd));
const LISTED_IDX = TRADED.map((_: any, i: number) => i).sort((a, b) => {
  const la = TRADED[a].listed_at || '9999', lb = TRADED[b].listed_at || '9999';
  return la < lb ? -1 : la > lb ? 1 : a - b;
});
// generic held-out runner: fp(trIdx, teIdx) -> predicted log10(mcap) for te
type FP = (tr: number[], te: number[]) => number[];
function loo(fp: FP, metric: (e: number[]) => number): number {
  const errs: number[] = [];
  for (let i = 0; i < TRADED.length; i++) {
    const tr = TRADED.map((_: any, j: number) => j).filter(j => j !== i);
    errs.push(fp(tr, [i])[0] - Y[i]);
  }
  return metric(errs);
}
function wf(fp: FP, metric: (e: number[]) => number): { m: number; cuts: number[] } {
  const cuts: number[] = [];
  for (const c of [0.4, 0.5, 0.67]) {
    const cut = Math.floor(LISTED_IDX.length * c);
    const tr = LISTED_IDX.slice(0, cut), te = LISTED_IDX.slice(cut);
    cuts.push(metric(fp(tr, te).map((pr, k) => pr - Y[te[k]])));
  }
  return { m: mean(cuts), cuts };
}
function newest35(fp: FP, metric: (e: number[]) => number): number {
  const tr = LISTED_IDX.slice(0, -35), te = LISTED_IDX.slice(-35);
  return metric(fp(tr, te).map((pr, k) => pr - Y[te[k]]));
}
function ridgeFP(lam: number, target: string): FP {
  return (tr, te) => {
    const yy = target === 'mult' ? YMULT : Y;
    const m = ridgeFit(tr.map(i => feats(TRADED[i])), tr.map(i => yy[i]), lam);
    const pr = ridgePred(m, te.map(i => feats(TRADED[i])));
    return target === 'mult' ? pr.map((v, k) => v + log10(TRADED[te[k]].tvl_usd)) : pr;
  };
}
function powFP(e: number): FP {
  return (tr, te) => {
    const x = (p: any) => [(p.change_7d || 0) / 100, ...TOPCATS.map(c => p.category === c ? 1 : 0)];
    const yy = tr.map(i => Y[i] - e * log10(TRADED[i].tvl_usd));
    const m = ridgeFit(tr.map(i => x(TRADED[i])), yy, 1);
    return ridgePred(m, te.map(i => x(TRADED[i]))).map((v, k) => v + e * log10(TRADED[te[k]].tvl_usd));
  };
}
// D-24: OLS (lam~0) + shrunk category-median residual shift, k=3
function d24FP(): FP {
  // D-24 (T1): OLS log-log on [1, log10 TVL] ONLY + per-category median residual
  // shift shrunk n/(n+3). NOT the full feature set.
  const lt1 = (p: any) => [log10(p.tvl_usd)];
  return (tr, te) => {
    const m = ridgeFit(tr.map(i => lt1(TRADED[i])), tr.map(i => Y[i]), 1e-6);
    const prTr = ridgePred(m, tr.map(i => lt1(TRADED[i])));
    const byCat: Record<string, number[]> = {};
    tr.forEach((idx, k) => {
      const c = TRADED[idx].category || 'none';
      (byCat[c] = byCat[c] || []).push(Y[idx] - prTr[k]);
    });
    const shift: Record<string, number> = {};
    for (const c of Object.keys(byCat)) {
      const v = byCat[c];
      shift[c] = median(v) * v.length / (v.length + 3);
    }
    return ridgePred(m, te.map(i => lt1(TRADED[i]))).map((v, k) => v + (shift[TRADED[te[k]].category || 'none'] || 0));
  };
}
// D-52 curve (wiliamkesh full): OLS log-ratio vs log TVL, winsor [0.01,3] on ratio,
// multiple capped 1.0x, growth w0.75 clamp [-60,200], maturity 0.6->1.0 over 1095d.
function curveFitIdx(pool: number[]): { a: number; b: number } {
  const xs = pool.map(i => Math.log(TRADED[i].tvl_usd));
  const ys = pool.map(i => Math.log(Math.min(3, Math.max(0.01, TRADED[i].mcap_usd / TRADED[i].tvl_usd))));
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let k = 0; k < xs.length; k++) { num += (xs[k] - mx) * (ys[k] - my); den += (xs[k] - mx) ** 2; }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}
function matMult(p: any): number {
  const d = ageDays(p) === null ? 365 : ageDays(p) as number;
  return 0.6 + Math.min(Math.max(d, 0), 1095) / 1095 * 0.4;
}
function growthMult(p: any): number {
  const g = Math.min(200, Math.max(-60, p.change_7d || 0));
  return 1 + (g / 100) * 0.75;
}
function curveFP(): FP {
  return (tr, te) => {
    const { a, b } = curveFitIdx(tr);
    return te.map(i => {
      const p = TRADED[i];
      const mult = Math.min(1, Math.max(0.01, Math.exp(a + b * Math.log(p.tvl_usd))));
      return log10(p.tvl_usd * mult * growthMult(p) * matMult(p));
    });
  };
}
function flatFP(): FP {
  return (tr, te) => {
    const med = median(tr.map(i => Y[i]));
    return te.map(() => med);
  };
}
function placeboFP(): FP {
  // seeded shuffle of y (same features, broken target): control that must fail.
  const rng = mulberry32(20261125);
  const perm = Y.map((_: number, i: number) => i);
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const yShuf = perm.map(i => Y[i]);
  return (tr, te) => {
    const m = ridgeFit(tr.map(i => feats(TRADED[i])), tr.map(i => yShuf[i]), 30);
    return ridgePred(m, te.map(i => feats(TRADED[i])));
  };
}

// ---------- model selection (frozen rule: lowest mean WF; <0.10x -> lowest median LOO; tie -> B) ----------
const FP_A = ridgeFP(30, 'mcap');
const FP_B = ridgeFP(3, 'mult');
const FP_C = powFP(0.45);
const FP_D24 = d24FP();
const FP_CURVE = curveFP();
const FP_FLAT = flatFP();
const FP_PLAC = placeboFP();
function modelStats(name: string, fp: FP): any {
  const medLoo = loo(fp, factorMed), meanLoo = loo(fp, factor);
  const mw = wf(fp, factorMed), mwMean = wf(fp, factor);
  return {
    medLoo: roundN(medLoo, 3), meanLoo: roundN(meanLoo, 3),
    medWF: roundN(mw.m, 3), meanWF: roundN(mwMean.m, 3),
    new35med: roundN(newest35(fp, factorMed), 2),
  };
}
const M_A = modelStats('A lam30', FP_A);
const M_B = modelStats('B lam3', FP_B);
const M_C = modelStats('C pow0.45', FP_C);
const M_D24 = modelStats('D24 OLS+cat-shift k3', FP_D24);
const M_CURVE = modelStats('kurva wiliamkesh', FP_CURVE);
const M_FLAT = modelStats('flat median', FP_FLAT);
const M_PLAC = modelStats('placebo (y acak)', FP_PLAC);
// inner-LOO lambda table (leakage-free): per WF cut, lambda chosen by LOO inside train only
function innerLooTable(): any[] {
  const out = [];
  for (const c of [0.4, 0.5, 0.67]) {
    const cut = Math.floor(LISTED_IDX.length * c);
    const tr = LISTED_IDX.slice(0, cut);
    const row: any = { cut: c };
    for (const lam of [10, 30]) {
      const errs: number[] = [];
      for (const i of tr) {
        const tri = tr.filter(j => j !== i);
        const m = ridgeFit(tri.map(k => feats(TRADED[k])), tri.map(k => Y[k]), lam);
        errs.push(ridgePred(m, [feats(TRADED[i])])[0] - Y[i]);
      }
      row['lam' + lam] = roundN(factorMed(errs), 2);
    }
    out.push(row);
  }
  return out;
}
const INNER_LOO = innerLooTable();
// R2 (5-fold-ish: in-sample fit R2 on clean-92) + slope
const M_FULL = ridgeFit(TRADED.map(feats), Y, 30);
const PRED_FULL = ridgePred(M_FULL, TRADED.map(feats));
const SS_TOT = Y.reduce((s, y) => s + (y - mean(Y)) ** 2, 0);
const SS_RES = Y.reduce((s, y, i) => s + (y - PRED_FULL[i]) ** 2, 0);
const R2 = roundN(1 - SS_RES / SS_TOT, 3);
const SLOPE = roundN(M_FULL.b[1], 3);
// cap p90 of clean traded multiples
const MULTS = TRADED.map((p: any) => p.mcap_usd / p.tvl_usd).sort((a: number, b: number) => a - b);
const CAP = quantile(MULTS, 0.9);
const MULT_MED = median(MULTS);
// board values, model A
const XEL = ELIG.map(feats);
const PRED_EL = ridgePred(M_FULL, XEL);
const CAPPED = ELIG.map((p: any, i: number) => {
  const unc = 10 ** PRED_EL[i];
  const mult = unc / p.tvl_usd;
  return Math.max(1, Math.round(Math.min(mult, CAP) * p.tvl_usd));
});
const MAX_MULT = Math.max(...CAPPED.map((v, i) => v / ELIG[i].tvl_usd));
const CAP_BINDS = CAPPED.filter((v, i) => (10 ** PRED_EL[i]) / ELIG[i].tvl_usd > CAP).length;
// curve board (D-52)
const { a: CA, b: CB } = curveFitIdx(TRADED.map((_: any, i: number) => i));
const CURVE_VALS = ELIG.map((p: any) => {
  const mult = Math.min(1, Math.max(0.01, Math.exp(CA + CB * Math.log(p.tvl_usd))));
  return Math.max(1, Math.round(p.tvl_usd * mult * growthMult(p) * matMult(p)));
});
function spearman(xs: number[], ys: number[]): number {
  const rank = (a: number[]): number[] => {
    const idx = a.map((_, i) => i).sort((i, j) => a[i] - a[j]);
    const r = new Array(a.length).fill(0);
    idx.forEach((v, k) => { r[v] = k + 1; });
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy || 1);
}
const TOP10_A = new Set(ELIG.map((_, i) => i).sort((a, b) => CAPPED[b] - CAPPED[a]).slice(0, 10));
const TOP10_CURVE = new Set(ELIG.map((_, i) => i).sort((a, b) => CURVE_VALS[b] - CURVE_VALS[a]).slice(0, 10));
const CURVE_OVERLAP = [...TOP10_A].filter(i => TOP10_CURVE.has(i)).length;

// ---------- odds ensemble (50% rich logistic + 30% empirical + 20% base) ----------
const YO = PROTO.map((p: any) => (p.gecko_id || p.symbol) ? 1 : 0);
const BASE_RATE = mean(YO);
function oddsFeats(p: any): number[] {
  const a = ageYears(p);
  return [log10(p.tvl_usd), log10(a), (p.change_7d || 0) / 100, log10(Math.max(1, p.chains.length)),
    log10(a) * log10(p.tvl_usd), pctInCat(p), ...TOPCATS.map(c => p.category === c ? 1 : 0)];
}
const XO_ALL = PROTO.map(oddsFeats);
const MU_O = XO_ALL[0].map((_: number, j: number) => mean(XO_ALL.map(r => r[j])));
const SD_O = XO_ALL[0].map((_: number, j: number) => Math.sqrt(mean(XO_ALL.map(r => (r[j] - MU_O[j]) ** 2))) || 1);
function stdO(X: number[][]): number[][] {
  return X.map(r => r.map((x, j) => (x - MU_O[j]) / SD_O[j]));
}
function fitLogit(Xs: number[][], y: number[], lam = 1): number[] {
  const d = Xs[0].length;
  let b = new Array(d + 1).fill(0);
  for (let it = 0; it < 100; it++) {
    const A: number[][] = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
    const v: number[] = new Array(d + 1).fill(0);
    for (let i = 0; i < Xs.length; i++) {
      const z = [1, ...Xs[i]];
      const s = z.reduce((acc, zv, k) => acc + zv * b[k], 0);
      const p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, s))));
      const w = Math.max(1e-6, p * (1 - p));
      const zz = (y[i] - p) / w + s;
      for (let a2 = 0; a2 <= d; a2++) { v[a2] += w * z[a2] * zz; for (let b2 = 0; b2 <= d; b2++) A[a2][b2] += w * z[a2] * z[b2]; }
    }
    for (let a2 = 1; a2 <= d; a2++) A[a2][a2] += lam;
    const nb = solve(A, v);
    const delta = Math.max(...nb.map((x, k) => Math.abs(x - b[k])));
    b = nb;
    if (delta < 1e-8) break;
  }
  return b;
}
function logitPred(b: number[], Xs: number[][]): number[] {
  return Xs.map(r => {
    const s = b[0] + r.reduce((acc, x, k) => acc + x * b[k + 1], 0);
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, s))));
  });
}
function ageBand(a: number | null): string {
  if (a === null) return 'unknown';
  if (a < 0.25) return '<90d';
  if (a < 1) return '90d-1y';
  if (a < 2) return '1-2y';
  return '>2y';
}
function empirPred(tr: number[], p: any, shrink = 10): number {
  const stats: Record<string, [number, number]> = {};
  const bands: Record<string, [number, number]> = {};
  const ayOf = (q: any): number | null => { const d = ageDays(q); return d === null ? null : d / 365.25; };
  for (const i of tr) {
    const q = PROTO[i];
    const k = ageBand(ayOf(q)) + '|' + (q.category || 'none');
    const s = stats[k] || (stats[k] = [0, 0]); s[0] += YO[i]; s[1]++;
    const b2 = bands[ageBand(ayOf(q))] || (bands[ageBand(ayOf(q))] = [0, 0]); b2[0] += YO[i]; b2[1]++;
  }
  const k = ageBand(ayOf(p)) + '|' + (p.category || 'none');
  if (stats[k] && stats[k][1] >= 5) { const [a2, n] = stats[k]; return (a2 + shrink * BASE_RATE) / (n + shrink); }
  const bd = bands[ageBand(ayOf(p))];
  if (bd && bd[1] >= 5) { const [a2, n] = bd; return (a2 + shrink * BASE_RATE) / (n + shrink); }
  return BASE_RATE;
}
function brier(pr: number[], y: number[]): number { return mean(pr.map((v, i) => (v - y[i]) ** 2)); }
function calledRight(pr: number[], y: number[]): number {
  return mean(pr.map((v, i) => ((v >= 0.5) === (y[i] >= 0.5)) ? 1 : 0));
}
const ORDER_ALL = PROTO.map((_: any, i: number) => i).sort((a, b) => {
  const la = PROTO[a].listed_at || '9999', lb = PROTO[b].listed_at || '9999';
  return la < lb ? -1 : la > lb ? 1 : a - b;
});
const XS_O_STD = stdO(XO_ALL);
const ODDS_CUTS: any[] = [];
const POOLED: { pr: number; y: number }[] = [];
for (const c of [0.4, 0.5, 0.67]) {
  const cut = Math.floor(ORDER_ALL.length * c);
  const tr = ORDER_ALL.slice(0, cut), te = ORDER_ALL.slice(cut);
  const b = fitLogit(tr.map(i => XS_O_STD[i]), tr.map(i => YO[i]));
  const prLog = logitPred(b, te.map(i => XS_O_STD[i]));
  const prEmp = te.map(i => empirPred(tr, PROTO[i]));
  const pr = te.map((_, k) => 0.5 * prLog[k] + 0.3 * prEmp[k] + 0.2 * BASE_RATE);
  const yte = te.map(i => YO[i]);
  const baseP = mean(yte);
  ODDS_CUTS.push({
    cut: c, brier: roundN(brier(pr, yte), 3), baseBrier: roundN(mean(yte.map(y => (baseP - y) ** 2)), 3),
    calledRight: roundN(calledRight(pr, yte), 3), nTest: te.length, testRate: roundN(baseP, 3),
    logBrier: roundN(brier(prLog, yte), 3),
  });
  te.forEach((_, k) => POOLED.push({ pr: pr[k], y: yte[k] }));
}
const ODDS_PASSES = ODDS_CUTS.every((c: any) => c.brier < c.baseBrier);
// tiers: terciles of WF-pooled odds, actual token rate per tier
const POOLED_SORTED = [...POOLED].sort((a, b) => a.pr - b.pr);
const T1C = POOLED_SORTED[Math.floor(POOLED_SORTED.length / 3)].pr;
const T2C = POOLED_SORTED[Math.floor(2 * POOLED_SORTED.length / 3)].pr;
function tierRate(lo: number, hi: number): number {
  const g = POOLED.filter(x => x.pr >= lo && x.pr < hi);
  return g.length ? roundN(mean(g.map(x => x.y)), 3) : 0;
}
const TIER_POOLED = {
  low: tierRate(0, T1C), med: tierRate(T1C, T2C), high: tierRate(T2C, 2),
};
// full-fit odds for the 198 board rows
const B_FULL = fitLogit(XS_O_STD, YO);
const ALL_IDX = PROTO.map((_: any, i: number) => i);
const LOG_FULL = logitPred(B_FULL, XS_O_STD);
const EMP_FULL = PROTO.map(p => empirPred(ALL_IDX, p));
const ODDS_FULL = PROTO.map((_: any, i: number) => 0.5 * LOG_FULL[i] + 0.3 * EMP_FULL[i] + 0.2 * BASE_RATE);
const ELIG_PROTO_IDX = ELIG.map(p => PROTO.indexOf(p));
const ODDS_RAW = ELIG_PROTO_IDX.map(i => ODDS_FULL[i]);
const ODDS = ODDS_RAW.map(o => Math.round(o * 1000) / 1000); // rounded ONCE; downstream uses rounded odds
const ODDS_SORTED = [...ODDS].sort((a, b) => a - b);
const TIER_CUT_LO = ODDS_SORTED[Math.floor(ODDS_SORTED.length / 3)];
const TIER_CUT_HI = ODDS_SORTED[Math.floor(2 * ODDS_SORTED.length / 3)];
function tierOf(o: number): string { return o < TIER_CUT_LO ? 'LOW' : o < TIER_CUT_HI ? 'MED' : 'HIGH'; }

// ---------- verdict economics (default $5K / 12wk / 7% drop, threshold +- $25 net FLOAT) ----------
const PLAN = 5000, HZ = 12, DROP = 0.07, THR = 25;
const GAS: Record<string, number> = { Ethereum: 8, Base: 0.05, Solana: 0.01, Arbitrum: 0.2, Binance: 0.15, Avalanche: 0.3 };
function gasOf(chain: string): number { return GAS[chain] === undefined ? 1 : GAS[chain]; }
function cheapestChain(p: any): string {
  if (!p.chains || !p.chains.length) return 'Ethereum';
  let best = p.chains[0], bg = gasOf(best);
  for (const c of p.chains) if (gasOf(c) < bg) { bg = gasOf(c); best = c; }
  return best;
}
function minGas(p: any): number { return p.chains && p.chains.length ? Math.min(...p.chains.map(gasOf)) : 1; }
function sliceOf(implied: number, tvl: number, odds: number, f = 1): number {
  return 1000 * (implied / tvl) * DROP * odds * f;
}
function costsOf(p: any, gasMult = 1): number {
  return 2 * minGas(p) * gasMult + PLAN * 0.001 + PLAN * 0.04 * (HZ / 52);
}
function netOf(p: any, implied: number, odds: number, f = 1, gasMult = 1, plan = PLAN): number {
  const sl = sliceOf(implied, p.tvl_usd, odds, f);
  return sl * (plan / 1000) - (2 * minGas(p) * gasMult + plan * 0.001) - plan * 0.04 * (HZ / 52);
}
function verdictOf(net: number): string { return net > THR ? 'FARM' : net < -THR ? 'SKIP' : 'MARGINAL'; }
function verdictCounts(f = 1, gasMult = 1, plan = PLAN): { FARM: number; MARGINAL: number; SKIP: number } {
  const c = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  ELIG.forEach((p, i) => { c[verdictOf(netOf(p, CAPPED[i], ODDS[i], f, gasMult, plan)) as 'FARM' | 'MARGINAL' | 'SKIP']++; });
  return c;
}
const VC_BASE = verdictCounts();
const VC_TYP = verdictCounts(0.926), VC_HARSH = verdictCounts(0.707), VC_GEN = verdictCounts(0.954);
const VC_BEAR = verdictCounts(0.33), VC_BULL25 = verdictCounts(2.5), VC_BULL30 = verdictCounts(3.0);
function logShareCounts(plan: number): { FARM: number; MARGINAL: number; SKIP: number } {
  const f = Math.log(1 + plan / 1000) / (plan / 1000);
  return verdictCounts(f, 1, plan);
}
const LS_1K = logShareCounts(1000), LS_5K = logShareCounts(5000), LS_25K = logShareCounts(25000);
const VC_4W = verdictCounts(1, 4);
// D-03 break-even: plan* = 2*gas / a, a = slice/1000 - 0.001 - 0.04*(12/52)
function breakEven(p: any, implied: number, odds: number): number | null {
  const a = sliceOf(implied, p.tvl_usd, odds) / 1000 - 0.001 - 0.04 * (HZ / 52);
  if (a <= 0) return null;
  return 2 * minGas(p) / a;
}
// D-04 walk-away: k* = slice*(plan/1000) / costs(plan)
function walkAway(p: any, implied: number, odds: number): number {
  return (sliceOf(implied, p.tvl_usd, odds) * (PLAN / 1000)) / costsOf(p);
}
// D-50 EV/cost, D-51 downside
const EV_COST = ELIG.map((p, i) => (sliceOf(CAPPED[i], p.tvl_usd, ODDS[i]) * (PLAN / 1000)) / costsOf(p));
const FARM_IDX = ELIG.map((_, i) => i).filter(i => verdictOf(netOf(ELIG[i], CAPPED[i], ODDS[i])) === 'FARM');
const DOWNS = FARM_IDX.map(i => costsOf(ELIG[i]));
const UPS = FARM_IDX.map(i => netOf(ELIG[i], CAPPED[i], ODDS[i]));
const DQ_WORSE = FARM_IDX.filter(i => costsOf(ELIG[i]) > netOf(ELIG[i], CAPPED[i], ODDS[i])).length;
const BEAR_SURV = FARM_IDX.filter(i => netOf(ELIG[i], CAPPED[i], ODDS[i], 0.33) > THR)
  .sort((a, b) => netOf(ELIG[b], CAPPED[b], ODDS[b]) - netOf(ELIG[a], CAPPED[a], ODDS[a]))
  .map(i => ELIG[i].name);
// D-55 gas-share (first chain, capital by TVL, hold by age) — gas table wiliamkesh:
// ETH $8, Solana $1, BTC-family $2, L2s $1, else $2 (NOT the verdict-economics table).
function gasWili(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 8;
  if (c === 'solana') return 1;
  if (c === 'bitcoin' || c === 'babylon genesis' || c === 'bittensor') return 2;
  if (['arbitrum', 'optimism', 'base', 'zksync', 'zksync era', 'linea', 'scroll', 'blast', 'mode', 'mantle', 'polygon', 'bsc', 'avalanche', 'fantom', 'gnosis'].includes(c)) return 1;
  return 2;
}
function capitalStd(p: any): number {
  return p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50;
}
function holdDays(p: any): number {
  const a = ageDays(p);
  if (a === null) return 30;
  return a < 180 ? 60 : a < 365 ? 45 : 30;
}
function gasShare(p: any): number {
  const g = p.chains && p.chains.length ? gasWili(p.chains[0]) : 2;
  const weeks = Math.max(1, Math.round(holdDays(p) / 7));
  return (g * 2 + g * weeks) / capitalStd(p) * 100;
}
function gasVerdict(s: number): string { return s <= 25 ? 'FARM' : s <= 50 ? 'THIN' : 'SKIP'; }
// D-56 farm value (capital moustakimm x implied multiple) + half-size
function capitalMoust(p: any): number {
  const base = p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50;
  if (p.change_7d !== null && p.change_7d !== undefined && p.change_7d < -10) return Math.max(25, Math.round(base / 2));
  return base;
}
// D-57 signals + capital tiers
function signalsOf(p: any): string[] {
  const s: string[] = [];
  if (WATCH.has(p.slug)) s.push('watchlist');
  if (p.change_7d !== null && p.change_7d !== undefined && p.change_7d >= 10) s.push('surging>=10%');
  else if (p.change_7d !== null && p.change_7d !== undefined && p.change_7d <= -10) s.push('sliding<=-10%');
  const a = ageDays(p);
  if (a !== null && a >= 1095) s.push('token-free>=3y');
  if (p.chains && p.chains.length >= 8) s.push('chains>=8');
  if (p.tvl_usd >= 1e9) s.push('billion-TVL');
  return s;
}
function capitalTier(p: any): string {
  return p.tvl_usd >= 5e8 ? 'institutional $1000-5000' : p.tvl_usd >= 1e8 ? 'large $500-2000'
    : p.tvl_usd >= 25e6 ? 'mid $250-1000' : 'early $100-500';
}
// D-33 conviction (presentation score, own definition from the five published components)
function conviction(p: any, comps: number): number {
  const tvlS = 40 * Math.min(Math.max(log10(p.tvl_usd / 5e6) / 3, 0), 1);
  const mom = 20 * (1 - Math.min(Math.abs(p.change_7d || 0), 60) / 60);
  const mat = 20 * Math.min(ageYears(p), 3) / 3;
  const brd = 10 * Math.min((p.chains || []).length, 10) / 10;
  const cat = 10 * Math.min(comps, 10) / 10;
  return Math.round(tvlS + mom + mat + brd + cat);
}
// D-53 launch score, age+size ONLY (growth excluded, D-05); components capped 40 / 30
function launchScore(p: any): number {
  const a = ageDays(p);
  const ageS = a === null ? 20 : Math.min(40, (a / 1095) * 40);
  const sizeS = Math.min(30, Math.max(0, (log10(p.tvl_usd / 5e6) / 3) * 30));
  return Math.round(Math.min(70, Math.max(0, ageS + sizeS)));
}
// D-54 confidence
function confidence(p: any): number {
  let s = 100;
  if (p.change_7d === null || p.change_7d === undefined) s -= 30;
  if (!p.listed_at) s -= 30;
  if (p.category === null || p.category === undefined) s -= 20;
  if (!p.chains || !p.chains.length) s -= 20;
  return Math.max(0, s);
}
// comps per row (traded comps in same category) + extrapolation flag (c)
const COMPS = ELIG.map(p => TRADED.filter(q => q.category === p.category).length);
const LT_MIN = Math.min(...TRADED.map(p => log10(p.tvl_usd)));
const LT_MAX = Math.max(...TRADED.map(p => log10(p.tvl_usd)));
const G_MIN = Math.min(...TRADED.map(p => (p.change_7d || 0) / 100));
const G_MAX = Math.max(...TRADED.map(p => (p.change_7d || 0) / 100));
const EXTRAP = ELIG.map(p => {
  const lt = log10(p.tvl_usd), g = (p.change_7d || 0) / 100;
  return lt < LT_MIN || lt > LT_MAX || g < G_MIN || g > G_MAX;
});
const GREY = ELIG.map(p => p.tvl_usd >= 50000000 && !WATCH.has(p.slug));

// ---------- HERO v14 (1): kalibrasi range PER TERCILE TVL ----------
// Tercile dari TVL 198 baris board (66/66/66).
const TVL_SORTED = ELIG.map(p => p.tvl_usd).sort((a, b) => a - b);
const TC1 = TVL_SORTED[65], TC2 = TVL_SORTED[131];
function tercileOf(tvl: number): number { return tvl <= TC1 ? 0 : tvl <= TC2 ? 1 : 2; }
const TERC_COUNTS = [0, 1, 2].map(t => ELIG.filter(p => tercileOf(p.tvl_usd) === t).length);
const LISTED_TRADED = [...TRADED].sort((a, b) => {
  const la = a.listed_at || '9999', lb = b.listed_at || '9999';
  return la < lb ? -1 : la > lb ? 1 : a.slug < b.slug ? -1 : 1;
});
function wfFold(c: number): { tr: any[]; te: any[] } {
  const cut = Math.floor(LISTED_TRADED.length * c);
  return { tr: LISTED_TRADED.slice(0, cut), te: LISTED_TRADED.slice(cut) };
}
// k per tercile: dicari pada POOLED WF test errors (3 fold digabung), grid 0.05,
// pilih k yang coverage-nya paling dekat target; seri -> k lebih besar (konservatif).
function pooledK(t: number, q: number, target: number): number {
  let best = 0.8, bestD = 9;
  for (let k20 = 16; k20 <= 80; k20++) {
    const k = k20 / 20;
    let hit = 0, tot = 0;
    for (const c of [0.4, 0.5, 0.67]) {
      const { tr, te } = wfFold(c);
      const m = ridgeFit(tr.map(feats), tr.map(p => log10(p.mcap_usd)), 30);
      const resTr = tr.map(p => Math.abs(ridgePred(m, [feats(p)])[0] - log10(p.mcap_usd)));
      const errTe = te.map(p => Math.abs(ridgePred(m, [feats(p)])[0] - log10(p.mcap_usd)));
      const trT = resTr.filter((_, i) => tercileOf(tr[i].tvl_usd) === t);
      const teT = errTe.filter((_, i) => tercileOf(te[i].tvl_usd) === t);
      const qv = quantile(trT, q);
      hit += teT.filter(e => e <= k * qv).length;
      tot += teT.length;
    }
    const cov = tot ? hit / tot : 0;
    const d = Math.abs(cov - target);
    if (d <= bestD + 1e-12) { bestD = d; best = k; }
  }
  return best;
}
const K_IN: number[] = [0, 1, 2].map(t => roundN(pooledK(t, 0.5, 0.5), 2));
const K_OUT: number[] = [0, 1, 2].map(t => roundN(pooledK(t, 0.8, 0.8), 2));
// coverage yang dicapai (pooled WF, faktor rata-rata yang dipakai board)
function pooledCoverage(perTercile: boolean): { inCov: number[]; outCov: number[]; n: number[] } {
  const inHit = [0, 0, 0], outHit = [0, 0, 0], n = [0, 0, 0];
  for (const c of [0.4, 0.5, 0.67]) {
    const { tr, te } = wfFold(c);
    const m = ridgeFit(tr.map(feats), tr.map(p => log10(p.mcap_usd)), 30);
    const resTr = tr.map(p => Math.abs(ridgePred(m, [feats(p)])[0] - log10(p.mcap_usd)));
    const errTe = te.map(p => Math.abs(ridgePred(m, [feats(p)])[0] - log10(p.mcap_usd)));
    for (let t = 0; t < 3; t++) {
      const trT = resTr.filter((_, i) => tercileOf(tr[i].tvl_usd) === t);
      const teIdx = te.map((_, i) => i).filter(i => tercileOf(te[i].tvl_usd) === t);
      const q50 = perTercile ? quantile(trT, 0.5) : quantile(resTr, 0.5);
      const q80 = perTercile ? quantile(trT, 0.8) : quantile(resTr, 0.8);
      const kI = perTercile ? K_IN[t] : 1.5, kO = perTercile ? K_OUT[t] : 1.6;
      for (const i of teIdx) {
        n[t]++;
        if (errTe[i] <= kI * q50) inHit[t]++;
        if (errTe[i] <= kO * q80) outHit[t]++;
      }
    }
  }
  return {
    inCov: inHit.map((h, t) => roundN(n[t] ? h / n[t] : 0, 3)),
    outCov: outHit.map((h, t) => roundN(n[t] ? h / n[t] : 0, 3)),
    n,
  };
}
const COV_TERC = pooledCoverage(true);
const COV_SINGLE = pooledCoverage(false);
// kuantil residual full-fit per tercile -> band board
const RES_FULL = TRADED.map((p, i) => Math.abs(PRED_FULL[i] - Y[i]));
const Q50_T = [0, 1, 2].map(t => quantile(RES_FULL.filter((_, i) => tercileOf(TRADED[i].tvl_usd) === t), 0.5));
const Q80_T = [0, 1, 2].map(t => quantile(RES_FULL.filter((_, i) => tercileOf(TRADED[i].tvl_usd) === t), 0.8));
const Q50_G = quantile(RES_FULL, 0.5), Q80_G = quantile(RES_FULL, 0.8);
// clean-cut (n=31, train 67% tertua): band faktor-tunggal vs per-tercile
function cleanCut(perTercile: boolean): { inCov: number; outCov: number; n: number } {
  const { tr, te } = wfFold(0.67);
  const m = ridgeFit(tr.map(feats), tr.map(p => log10(p.mcap_usd)), 30);
  const resTr = tr.map(p => Math.abs(ridgePred(m, [feats(p)])[0] - log10(p.mcap_usd)));
  const errTe = te.map(p => Math.abs(ridgePred(m, [feats(p)])[0] - log10(p.mcap_usd)));
  let hi = 0, ho = 0;
  te.forEach((p, i) => {
    const t = tercileOf(p.tvl_usd);
    const q50 = perTercile ? quantile(resTr.filter((_, j) => tercileOf(tr[j].tvl_usd) === t), 0.5) : quantile(resTr, 0.5);
    const q80 = perTercile ? quantile(resTr.filter((_, j) => tercileOf(tr[j].tvl_usd) === t), 0.8) : quantile(resTr, 0.8);
    const kI = perTercile ? K_IN[t] : 1.5, kO = perTercile ? K_OUT[t] : 1.6;
    if (errTe[i] <= kI * q50) hi++;
    if (errTe[i] <= kO * q80) ho++;
  });
  return { inCov: roundN(hi / te.length, 3), outCov: roundN(ho / te.length, 3), n: te.length };
}
const CLEAN_SINGLE = cleanCut(false);
const CLEAN_TERC = cleanCut(true);
// kontrol negatif Mondrian: kuantil per tercile dari train m67, diuji di cut-3
function mondrian(): { inCov: number; outCov: number } {
  const { tr, te } = wfFold(0.67);
  const m = ridgeFit(tr.map(feats), tr.map(p => log10(p.mcap_usd)), 30);
  const resTr = tr.map(p => Math.abs(ridgePred(m, [feats(p)])[0] - log10(p.mcap_usd)));
  const errTe = te.map(p => Math.abs(ridgePred(m, [feats(p)])[0] - log10(p.mcap_usd)));
  let hi = 0, ho = 0;
  te.forEach((p, i) => {
    const t = tercileOf(p.tvl_usd);
    const q50 = quantile(resTr.filter((_, j) => tercileOf(tr[j].tvl_usd) === t), 0.5);
    const q80 = quantile(resTr.filter((_, j) => tercileOf(tr[j].tvl_usd) === t), 0.8);
    if (errTe[i] <= q50) hi++;
    if (errTe[i] <= q80) ho++;
  });
  return { inCov: roundN(hi / te.length, 3), outCov: roundN(ho / te.length, 3) };
}
const MONDRIAN = mondrian();
// CQR-lite: pinball ridge quantiles (train 40% tertua, kalibrasi band40, uji cut-3)
function pinballFit(X: number[][], yy: number[], tau: number): { b: number[]; mu: number[]; sd: number[] } {
  const d = X[0].length;
  const mu = X[0].map((_: number, j: number) => mean(X.map(r => r[j])));
  const sd = X[0].map((_: number, j: number) => Math.sqrt(mean(X.map(r => (r[j] - mu[j]) ** 2))) || 1);
  const Xs = X.map(r => [1, ...r.map((x, j) => (x - mu[j]) / sd[j])]);
  const br = ridgeFit(X, yy, 30).b;
  const b = [...br];
  b[0] = br[0] + quantile(yy.map((y, i) => y - Xs[i].reduce((s, z, k) => s + z * br[k], 0)), tau);
  const lamPen = 0.5;
  for (let t = 0; t < 1500; t++) {
    const grad = new Array(d + 1).fill(0);
    for (let i = 0; i < Xs.length; i++) {
      const r = yy[i] - Xs[i].reduce((s, z, k) => s + z * b[k], 0);
      const g = r > 0 ? tau : tau - 1;
      for (let k = 0; k <= d; k++) grad[k] += -(Xs[i][k] * g) / Xs.length;
    }
    for (let k = 1; k <= d; k++) grad[k] += 2 * lamPen * b[k];
    const lr = 0.05 / (1 + t / 500);
    for (let k = 0; k <= d; k++) b[k] -= lr * grad[k];
  }
  return { b, mu, sd };
}
function pinballPred(m: { b: number[]; mu: number[]; sd: number[] }, X: number[][]): number[] {
  return X.map(r => m.b[0] + r.reduce((s, x, j) => s + m.b[j + 1] * (x - m.mu[j]) / m.sd[j], 0));
}
function cqrLite(): { inCov: number; outCov: number; widthIn: number; widthOut: number } {
  const c40 = Math.floor(LISTED_TRADED.length * 0.4), c67 = Math.floor(LISTED_TRADED.length * 0.67);
  const tr40 = LISTED_TRADED.slice(0, c40), band40 = LISTED_TRADED.slice(c40, c67), te = LISTED_TRADED.slice(c67);
  const X40 = tr40.map(feats), y40 = tr40.map(p => log10(p.mcap_usd));
  const out = { inCov: 0, outCov: 0, widthIn: 0, widthOut: 0 };
  for (const [taus, key] of [[ [0.25, 0.75], 'in' ], [ [0.1, 0.9], 'out' ]] as [number[], string][]) {
    const mLo = pinballFit(X40, y40, taus[0]), mHi = pinballFit(X40, y40, taus[1]);
    const E = band40.map(p => {
      const yv = log10(p.mcap_usd);
      return Math.max(pinballPred(mLo, [feats(p)])[0] - yv, yv - pinballPred(mHi, [feats(p)])[0]);
    });
    const alpha = key === 'in' ? 0.5 : 0.2;
    const s = [...E].sort((a, b) => a - b);
    const kk = Math.min(Math.max(Math.ceil((E.length + 1) * (1 - alpha)), 1), E.length);
    const Q = s[kk - 1];
    const lo = te.map(p => pinballPred(mLo, [feats(p)])[0] - Q);
    const hi = te.map(p => pinballPred(mHi, [feats(p)])[0] + Q);
    const cov = mean(te.map((p, i) => (log10(p.mcap_usd) >= lo[i] && log10(p.mcap_usd) <= hi[i]) ? 1 : 0));
    const w = median(te.map((_, i) => 10 ** ((hi[i] - lo[i]) / 2)));
    if (key === 'in') { out.inCov = roundN(cov, 3); out.widthIn = roundN(w, 2); }
    else { out.outCov = roundN(cov, 3); out.widthOut = roundN(w, 2); }
  }
  return out;
}
const CQR = cqrLite();

// ---------- HERO v14 (2): jackknife+ sebagai BAND UTAMA ----------
// Riset (D-45): lo = q25(P - |R|), hi = q75(P + |R|); lebar x/ = 10^((hi-lo)/2).
function jackknife(train: any[], targets: any[]): { lo: number[]; hi: number[]; loO: number[]; hiO: number[] } {
  const n = train.length;
  const P: number[][] = [];
  const R: number[] = [];
  for (let a = 0; a < n; a++) {
    const tri = train.filter((_, j) => j !== a);
    const m = ridgeFit(tri.map(feats), tri.map(p => log10(p.mcap_usd)), 30);
    P.push(ridgePred(m, targets.map(feats)));
    R.push(Math.abs(ridgePred(m, [feats(train[a])])[0] - log10(train[a].mcap_usd)));
  }
  const lo: number[] = [], hi: number[] = [], loO: number[] = [], hiO: number[] = [];
  for (let k = 0; k < targets.length; k++) {
    const minus = P.map((row, a) => row[k] - R[a]);
    const plus = P.map((row, a) => row[k] + R[a]);
    lo.push(quantile(minus, 0.25)); hi.push(quantile(plus, 0.75));
    loO.push(quantile(minus, 0.10)); hiO.push(quantile(plus, 0.90));
  }
  return { lo, hi, loO, hiO };
}
const { tr: JK_TR, te: JK_TE } = wfFold(0.67);
const JK_VAL = jackknife(JK_TR, JK_TE);
const JK_VAL_COV_IN = roundN(mean(JK_TE.map((p, i) => (log10(p.mcap_usd) >= JK_VAL.lo[i] && log10(p.mcap_usd) <= JK_VAL.hi[i]) ? 1 : 0)), 3);
const JK_VAL_COV_OUT = roundN(mean(JK_TE.map((p, i) => (log10(p.mcap_usd) >= JK_VAL.loO[i] && log10(p.mcap_usd) <= JK_VAL.hiO[i]) ? 1 : 0)), 3);
const JK_VAL_W_IN = roundN(median(JK_TE.map((_, i) => 10 ** ((JK_VAL.hi[i] - JK_VAL.lo[i]) / 2))), 2);
const JK_VAL_W_OUT = roundN(median(JK_TE.map((_, i) => 10 ** ((JK_VAL.hiO[i] - JK_VAL.loO[i]) / 2))), 2);
const JK_VAL_TERC = [0, 1, 2].map(t => {
  const idx = JK_TE.map((_, i) => i).filter(i => tercileOf(JK_TE[i].tvl_usd) === t);
  return {
    n: idx.length,
    inCov: idx.length ? roundN(mean(idx.map(i => (log10(JK_TE[i].mcap_usd) >= JK_VAL.lo[i] && log10(JK_TE[i].mcap_usd) <= JK_VAL.hi[i]) ? 1 : 0)), 3) : 0,
  };
});
const JK_BOARD = jackknife(TRADED, ELIG);
const JK_LO = JK_BOARD.lo.map(v => Math.max(1, Math.round(10 ** v)));
const JK_HI = JK_BOARD.hi.map(v => Math.max(1, Math.round(10 ** v)));
const JK_BOARD_W = roundN(median(ELIG.map((_, i) => 10 ** ((JK_BOARD.hi[i] - JK_BOARD.lo[i]) / 2))), 2);
// band conformal per-tercile untuk board
const R_LO = ELIG.map((_, i) => Math.max(1, Math.round(CAPPED[i] / 10 ** (K_IN[tercileOf(ELIG[i].tvl_usd)] * Q50_T[tercileOf(ELIG[i].tvl_usd)]))));
const R_HI = ELIG.map((_, i) => Math.max(1, Math.round(CAPPED[i] * 10 ** (K_IN[tercileOf(ELIG[i].tvl_usd)] * Q50_T[tercileOf(ELIG[i].tvl_usd)]))));
const RO_LO = ELIG.map((_, i) => Math.max(1, Math.round(CAPPED[i] / 10 ** (K_OUT[tercileOf(ELIG[i].tvl_usd)] * Q80_T[tercileOf(ELIG[i].tvl_usd)]))));
const RO_HI = ELIG.map((_, i) => Math.max(1, Math.round(CAPPED[i] * 10 ** (K_OUT[tercileOf(ELIG[i].tvl_usd)] * Q80_T[tercileOf(ELIG[i].tvl_usd)]))));

// ---------- HERO v14 (3): validasi time-split tunggal D-02 (70/30) ----------
const D02_CUT = Math.floor(LISTED_TRADED.length * 0.7);
const D02_TR = LISTED_TRADED.slice(0, D02_CUT), D02_TE = LISTED_TRADED.slice(D02_CUT);
const D02_M = ridgeFit(D02_TR.map(feats), D02_TR.map(p => log10(p.mcap_usd)), 30);
const D02_ERR = D02_TE.map(p => ridgePred(D02_M, [feats(p)])[0] - log10(p.mcap_usd));
const D02 = {
  cutoff: D02_TE[0].listed_at, nTrain: D02_TR.length, nTest: D02_TE.length,
  med: roundN(factorMed(D02_ERR), 2), mean: roundN(factor(D02_ERR), 2),
};

// ---------- bootstrap rank ranges D-22 (200 refit, seeded) ----------
const BOOT_RNG = mulberry32(20261125);
const BOOT_RANKS: number[][] = ELIG.map(() => []);
for (let b = 0; b < 200; b++) {
  const idx: number[] = [];
  for (let k = 0; k < TRADED.length; k++) idx.push(Math.floor(BOOT_RNG() * TRADED.length));
  const m = ridgeFit(idx.map(i => feats(TRADED[i])), idx.map(i => Y[i]), 30);
  const pr = ridgePred(m, XEL);
  const vals = ELIG.map((p, i) => Math.max(1, Math.round(Math.min((10 ** pr[i]) / p.tvl_usd, CAP) * p.tvl_usd)));
  const order = vals.map((_, i) => i).sort((a, c) => vals[c] - vals[a] || ELIG[a].slug.localeCompare(ELIG[b].slug));
  order.forEach((rowIdx, r) => BOOT_RANKS[rowIdx].push(r + 1));
}
const RANK_LO = BOOT_RANKS.map(rs => Math.round(quantile(rs, 0.1)));
const RANK_HI = BOOT_RANKS.map(rs => Math.round(quantile(rs, 0.9)));
const BOOT_WIDTH_MED = roundN(median(BOOT_RANKS.map((rs, i) => RANK_HI[i] - RANK_LO[i])), 2);
// top-20 stability: mean over current top-20 of P(stay in top 20)
const ORDER_BOARD = CAPPED.map((_, i) => i).sort((a, b) => CAPPED[b] - CAPPED[a] || ELIG[a].slug.localeCompare(ELIG[b].slug));
const TOP20 = ORDER_BOARD.slice(0, 20);
const TOP20_STAB = roundN(mean(TOP20.map(i => BOOT_RANKS[i].filter(r => r <= 20).length / 200)), 3);

// ---------- board rows ----------
const MECH: Record<string, [string, string]> = {
  RWA: ['deposit in the RWA vault', 'rebalance vault, log receipt'],
  Lending: ['supply the lending market', 'top up supply, check borrows'],
  Dexs: ['provide DEX liquidity', 're-center LP range, claim fees'],
  Yield: ['deposit in the yield vault', 'harvest and re-deposit yield'],
  'Yield Aggregator': ['deposit in the aggregator vault', 'rotate allocation, log it'],
  'Basis Trading': ['open a hedged basis trade', 'roll the basis leg, log funding'],
  CDP: ['mint against CDP collateral', 'check collateral ratio, top up'],
  Derivatives: ['open a hedged derivatives trade', 'roll the hedge, log expiry'],
  'Cross Chain': ['bridge a test amount', 'repeat the route, log receipt'],
  'Liquid Staking': ['stake in the liquid-staking pool', 'restake rewards, log receipt'],
};
function mechOf(p: any): [string, string] {
  return MECH[p.category || ''] || ['deposit into the protocol', 'repeat the deposit flow and log the receipt'];
}
function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}
function moneyShort(n: number): string {
  return n >= 1e9 ? '$' + roundN(n / 1e9, 1) + 'B' : n >= 1e6 ? '$' + roundN(n / 1e6, 1) + 'M' : '$' + Math.round(n / 1e3) + 'K';
}
function farmSteps(i: number): string[] {
  const p = ELIG[i];
  const implied = CAPPED[i];
  const odds = ODDS[i];
  const tier = tierOf(odds);
  const net = netOf(p, implied, odds);
  const fee = 2 * minGas(p) + PLAN * 0.001;
  const cheap = cheapestChain(p);
  const gas = minGas(p);
  const share = roundN(PLAN / p.tvl_usd * 100, 3);
  const mult = roundN(implied / p.tvl_usd, 2);
  const be = breakEven(p, implied, odds);
  const wa = walkAway(p, implied, odds);
  const comps = COMPS[i];
  const slice = sliceOf(implied, p.tvl_usd, odds) * (PLAN / 1000);
  const [mech, weekly] = mechOf(p);
  const rank = ORDER_BOARD.indexOf(i) + 1;
  const s1 = `Deposit $5,000 (${share}% of ${moneyShort(p.tvl_usd)} TVL) — ${mech} on ${cheap} (cheapest route, gas $${gas}/tx); fees ${money(fee)} (2 tx + 0.1%). ${p.name} ranks #${rank} at ${money(implied)} implied.`;
  const s2 = `Weekly for 12wk, ${weekly} (0.5h/wk, 6h); keep share near ${share}% of ${moneyShort(p.tvl_usd)} TVL. Net if it launches: $${net.toFixed(2)}.`;
  const s3 = `Check the ${comps} traded comps behind ${money(implied)} (${mult}x, odds ${odds} ${tier}); if TVL rises past ${roundN(wa, 2)}x the plan stops paying — see step 4.`;
  const s4 = `Risk: break-even ${be === null ? 'never (net stays negative at any size)' : money(be)}; walk away if TVL rises above ${roundN(wa, 5)}x. Verdict does not price eligibility risk: a launch does not guarantee you qualify; extra activity txs may be needed.`;
  const s5 = `Exit after 12wk or at launch: unwind, claim if eligible, sell half at TGE, vest the rest. Odds ${tier} (WF-tested). Expected slice $${slice.toFixed(2)} on $5,000.`;
  return [s1, s2, s3, s4, s5];
}
const ROWS = ORDER_BOARD.map((ei, r) => {
  const p = ELIG[ei];
  const implied = CAPPED[ei];
  const odds = ODDS[ei];
  const net = netOf(p, implied, odds);
  const verdict = verdictOf(net);
  const be = breakEven(p, implied, odds);
  const wa = walkAway(p, implied, odds);
  const gs = gasShare(p);
  const fv = capitalMoust(p) * (implied / p.tvl_usd);
  return {
    slug: p.slug, name: p.name, rank: r + 1, implied_value_usd: implied,
    farm_steps: farmSteps(ei),
    category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d,
    age_days: ageDays(p), multiple: roundN(implied / p.tvl_usd, 4),
    odds, odds_tier: tierOf(odds), verdict, net_usd: roundN(net, 2),
    net_per_hour_usd: roundN(net / 6, 2), fee_usd: roundN(2 * minGas(p) + PLAN * 0.001, 2),
    break_even_usd: be === null ? null : Math.round(be),
    walk_away_x: roundN(wa, 2),
    range_lo_usd: R_LO[ei], range_hi_usd: R_HI[ei],
    range_outer_lo_usd: RO_LO[ei], range_outer_hi_usd: RO_HI[ei],
    jk_lo_usd: JK_LO[ei], jk_hi_usd: JK_HI[ei], tercile: tercileOf(p.tvl_usd),
    conviction: conviction(p, COMPS[ei]), ev_per_cost: roundN(EV_COST[ei], 2),
    launch_score: launchScore(p), gas_share_pct: roundN(gs, 1), gas_verdict: gasVerdict(gs),
    gas_wili_usd: p.chains && p.chains.length ? gasWili(p.chains[0]) : 2,
    farm_value_usd: roundN(fv, 2), half_size: (p.change_7d || 0) < -10,
    capital_tier: capitalTier(p), cheapest_chain: cheapestChain(p), first_chain: (p.chains && p.chains[0]) || null,
    cheapest_gas_usd: minGas(p), rank_lo: RANK_LO[ei], rank_hi: RANK_HI[ei],
    comps: COMPS[ei], extrapolated: EXTRAP[ei], grey_zone: GREY[ei], watchlist: WATCH.has(p.slug),
    confidence: confidence(p), signals: signalsOf(p), token_status: 'pre-token',
  };
});
const TOTAL = ROWS.reduce((s, r) => s + r.implied_value_usd, 0);
const TOP1 = ROWS[0];
const VC = { FARM: VC_BASE.FARM, MARGINAL: VC_BASE.MARGINAL, SKIP: VC_BASE.SKIP };
const EXPECTED_TOTAL = Math.round(ELIG.reduce((s, _, i) => s + CAPPED[i] * ODDS[i], 0));
// D-62 disposition (priority: category bridges/staking/CEX, then versioned, wrapped, exchange-name)
function disposition(): number[] {
  let bridges = 0, staking = 0, cex = 0, vers = 0, wrap = 0, exch = 0;
  for (const p of PRETOKEN) {
    if (clean(p)) continue;
    if (p.category === 'Bridge' || p.category === 'Canonical Bridge') bridges++;
    else if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') staking++;
    else if (p.category === 'CEX') cex++;
    else if (VERS.test(p.name)) vers++;
    else if (WRAP.test(p.name)) wrap++;
    else if (EXCH.test(p.name)) exch++;
  }
  return [198, 416, bridges, staking, cex, vers, wrap, exch];
}
const DISP = disposition();
// D-28 category median multiples (n>=2, clean-92)
const CAT_MED: { cat: string; n: number; med: number }[] = [];
for (const c of Object.keys(CATN)) {
  const vals = TRADED.filter(p => (p.category || 'none') === c).map(p => p.mcap_usd / p.tvl_usd);
  if (vals.length >= 2) CAT_MED.push({ cat: c, n: vals.length, med: roundN(median(vals), 2) });
}
CAT_MED.sort((a, b) => b.med - a.med);
// D-11 calendar: 7 chains with the most FARM rows; top 5 rows per chain by net/hour
const FARM_BY_CHAIN: Record<string, number[]> = {};
for (const i of FARM_IDX) { const ch = cheapestChain(ELIG[i]); (FARM_BY_CHAIN[ch] = FARM_BY_CHAIN[ch] || []).push(i); }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CALENDAR = Object.keys(FARM_BY_CHAIN)
  .sort((a, b) => FARM_BY_CHAIN[b].length - FARM_BY_CHAIN[a].length
    || (FARM_BY_CHAIN[b].reduce((s, i) => s + netOf(ELIG[i], CAPPED[i], ODDS[i]), 0) - FARM_BY_CHAIN[a].reduce((s, i) => s + netOf(ELIG[i], CAPPED[i], ODDS[i]), 0)))
  .slice(0, 7)
  .map((ch, k) => {
    const rows = [...FARM_BY_CHAIN[ch]].sort((a, b) => netOf(ELIG[b], CAPPED[b], ODDS[b]) - netOf(ELIG[a], CAPPED[a], ODDS[a])).slice(0, 5);
    return {
      day: DAYS[k], chain: ch, n: rows.length,
      net: Math.round(rows.reduce((s, i) => s + netOf(ELIG[i], CAPPED[i], ODDS[i]), 0)),
      hours: roundN(rows.length * 0.5, 1),
    };
  });
const CAL_ROWS = CALENDAR.reduce((s, c) => s + c.n, 0);
const CAL_NET = CALENDAR.reduce((s, c) => s + c.net, 0);
const CAL_HRS = CALENDAR.reduce((s, c) => s + c.hours, 0);
// D-34 strip: watchlist token status from the sealed snapshot itself
const WL_ROWS = ROWS.filter(r => r.watchlist);
const D34 = {
  total: WL_ROWS.length,
  tokenTrades: WL_ROWS.filter(r => r.token_status !== 'pre-token').length,
  preToken: WL_ROWS.filter(r => r.token_status === 'pre-token').length,
  slugs: WL_ROWS.map(r => r.slug),
};
// D-03 / D-04 / D-50 / D-55 / D-56 / D-57 aggregates (entry's own numbers)
const BE_FINITE = ROWS.filter(r => r.break_even_usd !== null);
const D03 = {
  finite: BE_FINITE.length, never: ROWS.length - BE_FINITE.length,
  median: BE_FINITE.length ? Math.round(median(BE_FINITE.map(r => r.break_even_usd as number))) : null,
  p10: BE_FINITE.length ? Math.round(quantile(BE_FINITE.map(r => r.break_even_usd as number), 0.1)) : null,
  p90: BE_FINITE.length ? Math.round(quantile(BE_FINITE.map(r => r.break_even_usd as number), 0.9)) : null,
  max: BE_FINITE.length ? Math.max(...BE_FINITE.map(r => r.break_even_usd as number)) : null,
};
const FARM_WA = ROWS.filter(r => r.verdict === 'FARM').map(r => r.walk_away_x);
const D04 = {
  median: roundN(median(FARM_WA), 2), p10: roundN(quantile(FARM_WA, 0.1), 2),
  p90: roundN(quantile(FARM_WA, 0.9), 2), min: roundN(Math.min(...FARM_WA), 2),
  max: roundN(Math.max(...FARM_WA), 2), fragile: FARM_WA.filter(x => x < 2).length,
  robust: FARM_WA.filter(x => x > 10).length,
};
const D50 = {
  median: roundN(median(EV_COST), 2), p90: roundN(quantile(EV_COST, 0.9), 2),
  max: roundN(Math.max(...EV_COST), 2), gt1: EV_COST.filter(x => x > 1).length,
  gt3: EV_COST.filter(x => x > 3).length,
};
const GS_ALL = ROWS.map(r => r.gas_share_pct);
const D55 = {
  counts: { FARM: ROWS.filter(r => r.gas_verdict === 'FARM').length, THIN: ROWS.filter(r => r.gas_verdict === 'THIN').length, SKIP: ROWS.filter(r => r.gas_verdict === 'SKIP').length },
  median: roundN(median(GS_ALL), 1), max: roundN(Math.max(...GS_ALL), 1),
};
const FV_ALL = ROWS.map(r => r.farm_value_usd);
const D56 = { median: roundN(median(FV_ALL), 2), max: roundN(Math.max(...FV_ALL), 2), half: ROWS.filter(r => r.half_size).length };
const SIG_COUNT: Record<string, number> = {};
for (const r of ROWS) for (const s of r.signals) SIG_COUNT[s] = (SIG_COUNT[s] || 0) + 1;
const D57 = {
  signals: SIG_COUNT, zeroSignals: ROWS.filter(r => r.signals.length === 0).length,
  tiers: {
    early: ROWS.filter(r => r.capital_tier.startsWith('early')).length,
    mid: ROWS.filter(r => r.capital_tier.startsWith('mid')).length,
    large: ROWS.filter(r => r.capital_tier.startsWith('large')).length,
    institutional: ROWS.filter(r => r.capital_tier.startsWith('institutional')).length,
  },
};
const CONV_TOP5 = [...ROWS].sort((a, b) => b.conviction - a.conviction).slice(0, 5).map(r => ({ name: r.name, score: r.conviction }));
const CONV_MED = median(ROWS.map(r => r.conviction));
const LS_ALL = ROWS.map(r => r.launch_score);
const D53 = { median: median(LS_ALL), p10: quantile(LS_ALL, 0.1), p90: quantile(LS_ALL, 0.9), max: Math.max(...LS_ALL), min: Math.min(...LS_ALL) };
const D54 = { full: ROWS.filter(r => r.confidence === 100).length, partial: ROWS.filter(r => r.confidence < 100).length };
const EXTRAP_N = ROWS.filter(r => r.extrapolated).length;
const GREY_N = ROWS.filter(r => r.grey_zone).length;
// Top-10 narrative (original, from this entry's numbers)
const TOP10 = ROWS.slice(0, 10);
const NARRATIVE = `${TOP1.name} leads at ${money(TOP1.implied_value_usd)} (${roundN(TOP1.multiple, 2)}x TVL), ahead of ${TOP10[1].name} at ${money(TOP10[1].implied_value_usd)}; top 10 hold ${money(TOP10.reduce((s, r) => s + r.implied_value_usd, 0))} of ${money(TOTAL)}. ` +
  `${VC.FARM} FARM at $5K/12wk/7%, but only ${BEAR_SURV.length} survive bear x0.33 — ${BEAR_SURV.join(', ')} — most FARM verdicts are fragile. ` +
  `Ranges calibrated per tercile (inner ${COV_TERC.inCov.map(c => Math.round(c * 100) + '%').join('/')}) with jackknife+ as main band (median x/${JK_BOARD_W}); the old single-factor band under-covered the middle tercile. ` +
  `Watchlist is the floor: ${D34.total}/40 on the board, plus ${ROWS.length - D34.total} more; snapshot records no token for any of the 40.`;

// ---------- META (board.json + data.js share this object) ----------
const META: any = {
  model: 'A lam30', cap: roundN(CAP, 3), capB: CAP_BINDS,
  maxMult: roundN(MAX_MULT, 3), flatM: roundN(MULT_MED, 3),
  models: { A: M_A, B: M_B, C: M_C, D24: M_D24, curve: M_CURVE, flat: M_FLAT, placebo: M_PLAC },
  iLoo: INNER_LOO, r2: R2, slope: SLOPE,
  curveB: {
    top1: ELIG[CURVE_VALS.indexOf(Math.max(...CURVE_VALS))].name,
    top1Usd: Math.max(...CURVE_VALS), total: CURVE_VALS.reduce((s, v) => s + v, 0),
    spearman: roundN(spearman(CAPPED, CURVE_VALS), 3), top10Overlap: CURVE_OVERLAP,
  },
  odds: {
    cuts: ODDS_CUTS, cutLo: TIER_CUT_LO, cutHi: TIER_CUT_HI,
    tp: TIER_POOLED, baseRate: roundN(BASE_RATE, 3),
  },
  tot: {
    total: TOTAL, top1: TOP1.implied_value_usd, top1Name: TOP1.name,
    top5: ROWS.slice(0, 5).reduce((s, r) => s + r.implied_value_usd, 0),
    top10: ROWS.slice(0, 10).reduce((s, r) => s + r.implied_value_usd, 0),
    median: median(ROWS.map(r => r.implied_value_usd)), expectedTotal: EXPECTED_TOTAL,
  },
  vc: VC,
  vest: { typical: VC_TYP, harsh: VC_HARSH, generous: VC_GEN, pv: { typical: 0.926, harsh: 0.707, generous: 0.954 } },
  bb: { bear033: VC_BEAR, bull25: VC_BULL25, bull30: VC_BULL30, bearSurvivors: BEAR_SURV },
  ls: { k1: LS_1K, k5: LS_5K, k25: LS_25K },
  mw: VC_4W,
  dn: { medianDown: Math.round(median(DOWNS)), medianUp: Math.round(median(UPS)), worse: DQ_WORSE, nFarm: FARM_IDX.length },
  d03: D03, d04: D04, d50: D50, d55: D55, d56: D56, d57: D57,
  conv: { median: CONV_MED, top5: CONV_TOP5 },
  d53: D53, d54: D54,
  terc: {
    cuts: [TC1, TC2], counts: TERC_COUNTS, kIn: K_IN, kOut: K_OUT,
    q50: Q50_T.map(v => roundN(v, 3)), q80: Q80_T.map(v => roundN(v, 3)),
    covIn: COV_TERC.inCov, covOut: COV_TERC.outCov, n: COV_TERC.n,
    singleCovIn: COV_SINGLE.inCov, singleCovOut: COV_SINGLE.outCov,
    cleanSingle: CLEAN_SINGLE, cleanTerc: CLEAN_TERC,
  },
  jk: {
    valIn: JK_VAL_COV_IN, valOut: JK_VAL_COV_OUT, valWidthIn: JK_VAL_W_IN, valWidthOut: JK_VAL_W_OUT,
    valTerc: JK_VAL_TERC, boardWidthIn: JK_BOARD_W,
  },
  mondrian: MONDRIAN, cqr: CQR,
  d02: D02,
  boot: { widthMed: BOOT_WIDTH_MED, top20Stab: TOP20_STAB },
  disp: DISP, extrap: EXTRAP_N, grey: GREY_N,
  catM: CAT_MED,
  cal: CALENDAR, calRows: CAL_ROWS, calNet: CAL_NET, calHrs: CAL_HRS,
  d34: { total: D34.total, tokenTrades: D34.tokenTrades, preToken: D34.preToken },
  narrative: NARRATIVE, medA: roundN(MED_AGE, 4),
  // ridge coefficients for per-row Rebuild (dashboard recomputes from inputs x coefficients)
  coef: { b: M_FULL.b, mu: M_FULL.mu, sd: M_FULL.sd, topcats: TOPCATS, cap: CAP },
};
// ---------- data.js (compact rows; economics re-derived live in app.js) ----------
const CHAIN_DICT: string[] = [];
const chainIdx = (c: string): number => {
  let i = CHAIN_DICT.indexOf(c);
  if (i < 0) { CHAIN_DICT.push(c); i = CHAIN_DICT.length - 1; }
  return i;
};
const CAT_DICT: string[] = [];
const catIdx = (c: string | null): number => {
  const k = c || 'none';
  let i = CAT_DICT.indexOf(k);
  if (i < 0) { CAT_DICT.push(k); i = CAT_DICT.length - 1; }
  return i;
};
// row array: [slug,name,cat,chains,tvl,growth,age,implied,odds,jkLo,jkHi,tercile,rankLo,rankHi,comps,flags]
// rows: [name, catIdx, chainIdx[], tvl, growth, age, implied, odds, jkLo, jkHi,
// rankLo, rankHi, comps, flags] — slug derives from name (lowercase, space->'-'),
// tercile derives from tvl + META.terc.cuts, wili gas derives from first chain.
const DATA_ROWS = ROWS.map(r => [
  r.name, catIdx(r.category), (r.chains || []).map(chainIdx),
  r.tvl_usd, r.change_7d, r.age_days, r.implied_value_usd, r.odds,
  r.jk_lo_usd, r.jk_hi_usd, r.rank_lo, r.rank_hi, r.comps,
  (r.extrapolated ? 1 : 0) + (r.grey_zone ? 2 : 0) + (r.watchlist ? 4 : 0) + (r.half_size ? 8 : 0),
]);
const DATA_JS = 'window.DATA={chains:' + JSON.stringify(CHAIN_DICT)
  + ',cats:' + JSON.stringify(CAT_DICT)
  + ',meta:' + JSON.stringify(META)
  + ',rows:' + JSON.stringify(DATA_ROWS) + '};\n';
// ---------- run ----------
function main(): void {
  mkdirSync(OUTPUT, { recursive: true });
  mkdirSync(join(OUTPUT, 'dashboard'), { recursive: true });
  mkdirSync(join(OUTPUT, 'screenshots'), { recursive: true });
  const board = { meta: META, rows: ROWS };
  writeFileSync(join(OUTPUT, 'board.json'), JSON.stringify(board));
  writeFileSync(join(OUTPUT, 'dashboard', 'data.js'), DATA_JS);
  // copy dashboard files + screenshots from the entry dir (never delete /output)
  for (const f of ['index.html', 'app.css', 'app.js']) {
    const src = join(HERE, 'dashboard', f);
    if (!existsSync(src)) throw new Error('missing dashboard file: ' + f);
    cpSync(src, join(OUTPUT, 'dashboard', f));
  }
  const shotDir = join(HERE, 'screenshots');
  if (existsSync(shotDir)) {
    for (const f of readdirSync(shotDir)) {
      if (/^\d\d-.*\.(jpg|jpeg|png)$/i.test(f)) cpSync(join(shotDir, f), join(OUTPUT, 'screenshots', f));
    }
  }
  writeFileSync(join(OUTPUT, 'dossier.json'), buildDossier(OUTPUT, { text_max_bytes: 65536 }));
  // plain-text verification summary for the builder log
  console.log('v14 total=' + TOTAL + ' top1=' + TOP1.name + ' ' + TOP1.implied_value_usd
    + ' verdicts=' + VC.FARM + '/' + VC.MARGINAL + '/' + VC.SKIP
    + ' kIn=' + K_IN.join(',') + ' kOut=' + K_OUT.join(',')
    + ' covIn=' + COV_TERC.inCov.join(',') + ' covOut=' + COV_TERC.outCov.join(',')
    + ' jkVal=' + JK_VAL_COV_IN + '/' + JK_VAL_COV_OUT + ' x/' + JK_VAL_W_IN
    + ' d02=' + D02.med + '/' + D02.mean + ' rows=' + ROWS.length);
}
main();
