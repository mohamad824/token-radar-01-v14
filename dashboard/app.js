// Token Radar v14: all numbers derive live from window.DATA (board.json twin). Main range = jackknife+.
const D = window.DATA, M = D.meta, PLAN = 5000, HZ = 12, DROP0 = 0.07, THR = 25;
const $ = id => document.getElementById(id);
const l10 = x => Math.log(x) / Math.LN10;
const vc = o => o.FARM + '/' + o.MARGINAL + '/' + o.SKIP;
const rN = (x, d) => { const f = 10 ** d; return Math.round(x * f) / f; };
const fmt$ = n => '$' + Math.round(n).toLocaleString('en-US');
const fmtS = n => n >= 1e9 ? '$' + rN(n / 1e9, 1) + 'B' : n >= 1e6 ? '$' + rN(n / 1e6, 1) + 'M' : '$' + Math.round(n / 1e3) + 'K';
const GAS = { Ethereum: 8, Base: 0.05, Solana: 0.01, Arbitrum: 0.2, Binance: 0.15, Avalanche: 0.3 };
const gasOf = c => GAS[c] === undefined ? 1 : GAS[c];
const GWILI = { ethereum: 8, solana: 1, bitcoin: 2, 'babylon genesis': 2, bittensor: 2, arbitrum: 1, optimism: 1, base: 1, zksync: 1, 'zksync era': 1, linea: 1, scroll: 1, blast: 1, mode: 1, mantle: 1, polygon: 1, bsc: 1, avalanche: 1, fantom: 1, gnosis: 1 };
const gwiliOf = c => GWILI[c.toLowerCase()] === undefined ? 2 : GWILI[c.toLowerCase()];
const R = D.rows.map(r => {
  const o = { name: r[0], cat: D.cats[r[1]], chains: r[2].map(i => D.chains[i]), tvl: r[3], g: r[4], age: r[5], imp: r[6], odds: r[7], jkLo: r[8], jkHi: r[9], rLo: r[10], rHi: r[11], comps: r[12], fl: r[13] };
  o.slug = o.name.toLowerCase().replace(/ /g, '-');
  o.terc = o.tvl <= M.terc.cuts[0] ? 0 : o.tvl <= M.terc.cuts[1] ? 1 : 2;
  o.watch = !!(o.fl & 4); o.grey = !!(o.fl & 2); o.extrap = !!(o.fl & 1); o.half = !!(o.fl & 8);
  o.cheap = o.chains.length ? o.chains.reduce((a, c) => gasOf(c) < gasOf(a) ? c : a, o.chains[0]) : 'Ethereum';
  o.gas = o.chains.length ? Math.min(...o.chains.map(gasOf)) : 1;
  o.gwili = o.chains.length ? gwiliOf(o.chains[0]) : 2;
  o.mult = o.imp / o.tvl;
  o.tier = o.odds < M.odds.cutLo ? 'LOW' : o.odds < M.odds.cutHi ? 'MED' : 'HIGH';
  o.costs = 2 * o.gas + PLAN * 0.001 + PLAN * 0.04 * (HZ / 52);
  o.fee = 2 * o.gas + PLAN * 0.001;
  o.slice = 1000 * o.mult * DROP0 * o.odds;
  o.net = o.slice * (PLAN / 1000) - o.costs;
  o.verdict = o.net > THR ? 'FARM' : o.net < -THR ? 'SKIP' : 'MARGINAL';
  o.a = o.slice / 1000 - 0.001 - 0.04 * (HZ / 52);
  o.be = o.a <= 0 ? null : 2 * o.gas / o.a;
  o.walk = o.slice * (PLAN / 1000) / o.costs;
  o.evcost = (o.slice * (PLAN / 1000)) / o.costs;
  o.conv = Math.round(40 * Math.min(Math.max(l10(o.tvl / 5e6) / 3, 0), 1) + 20 * (1 - Math.min(Math.abs(o.g || 0), 60) / 60) + 20 * Math.min(o.age === null ? M.medA : o.age / 365.25, 3) / 3 + 10 * Math.min(o.chains.length, 10) / 10 + 10 * Math.min(o.comps, 10) / 10);
  o.launch = Math.round(Math.min(70, Math.max(0, (o.age === null ? 20 : Math.min(40, (o.age / 1095) * 40)) + Math.min(30, Math.max(0, (l10(o.tvl / 5e6) / 3) * 30)))));
  o.capStd = o.tvl >= 5e9 ? 250 : o.tvl >= 1e9 ? 150 : o.tvl >= 1e8 ? 100 : 50;
  o.hold = o.age === null ? 30 : o.age < 180 ? 60 : o.age < 365 ? 45 : 30;
  o.gshare = (o.gwili * 2 + o.gwili * Math.max(1, Math.round(o.hold / 7))) / o.capStd * 100;
  o.gverdict = o.gshare <= 25 ? 'FARM' : o.gshare <= 50 ? 'THIN' : 'SKIP';
  o.capM = o.capStd;
  if ((o.g || 0) < -10) o.capM = Math.max(25, Math.round(o.capM / 2));
  o.fval = o.capM * o.mult;
  o.conf = 100 - ((o.g === null || o.g === undefined) ? 30 : 0) - (o.age === null ? 30 : 0) - (o.cat === 'none' ? 20 : 0) - (o.chains.length ? 0 : 20);
  o.signals = [];
  if (o.watch) o.signals.push('watchlist');
  if ((o.g || 0) >= 10) o.signals.push('surging>=10%'); else if ((o.g || 0) <= -10) o.signals.push('sliding<=-10%');
  if (o.age !== null && o.age >= 1095) o.signals.push('token-free>=3y');
  if (o.chains.length >= 8) o.signals.push('chains>=8');
  if (o.tvl >= 1e9) o.signals.push('billion-TVL');
  o.tierCap = o.tvl >= 5e8 ? 'institutional' : o.tvl >= 1e8 ? 'large' : o.tvl >= 25e6 ? 'mid' : 'early';
  return o;
});
// rows arrive ranked from data.js; assign rank in that order
R.forEach((o, i) => o.rank = i + 1);
const bySlug = {}; R.forEach(o => bySlug[o.slug] = o);
// Rebuild: implied from inputs x coefficients (must MATCH board.json to the dollar)
function rebuild(o) {
  const c = M.coef, x = [l10(o.tvl), (o.g || 0) / 100, ...c.topcats.map(t => o.cat === t ? 1 : 0)];
  let s = c.b[0]; for (let j = 0; j < x.length; j++) s += c.b[j + 1] * (x[j] - c.mu[j]) / c.sd[j];
  const unc = 10 ** s, m = unc / o.tvl;
  return Math.max(1, Math.round(Math.min(m, c.cap) * o.tvl));
}
const MECH = { RWA: ['deposit in the RWA vault', 'rebalance vault, log receipt'], Lending: ['supply the lending market', 'top up supply, check borrows'], Dexs: ['provide DEX liquidity', 're-center LP range, claim fees'], Yield: ['deposit in the yield vault', 'harvest and re-deposit yield'], 'Yield Aggregator': ['deposit in the aggregator vault', 'rotate allocation, log it'], 'Basis Trading': ['open a hedged basis trade', 'roll the basis leg, log funding'], CDP: ['mint against CDP collateral', 'check collateral ratio, top up'], Derivatives: ['open a hedged derivatives trade', 'roll the hedge, log expiry'], 'Cross Chain': ['bridge a test amount', 'repeat the route, log receipt'], 'Liquid Staking': ['stake in the liquid-staking pool', 'restake rewards, log receipt'] };
function farmSteps(o) {
  const share = rN(PLAN / o.tvl * 100, 3), mult = rN(o.mult, 2), slice = o.slice * (PLAN / 1000);
  const mm = MECH[o.cat] || ['deposit into the protocol', 'repeat the deposit flow and log the receipt'];
  return [
    `Deposit $5,000 (${share}% of ${fmtS(o.tvl)} TVL) — ${mm[0]} on ${o.cheap} (cheapest route, gas $${o.gas}/tx); fees ${fmt$(o.fee)} (2 tx + 0.1%). ${o.name} ranks #${o.rank} at ${fmt$(o.imp)} implied.`,
    `Weekly for 12wk, ${mm[1]} (0.5h/wk, 6h); keep share near ${share}% of ${fmtS(o.tvl)} TVL. Net if it launches: ${'$' + o.net.toFixed(2)}.`,
    `Check the ${o.comps} traded comps behind ${fmt$(o.imp)} (${mult}x, odds ${o.odds} ${o.tier}); if TVL rises past ${rN(o.walk, 2)}x the plan stops paying — see step 4.`,
    `Risk: break-even ${o.be === null ? 'never (net stays negative at any size)' : fmt$(o.be)}; walk away if TVL rises above ${rN(o.walk, 5)}x. Verdict does not price eligibility risk: a launch does not guarantee you qualify; extra activity txs may be needed.`,
    `Exit after 12wk or at launch: unwind, claim if eligible, sell half at TGE, vest the rest. Odds ${o.tier} (WF-tested). Expected slice ${'$' + slice.toFixed(2)} on $5,000.`];
}
function verdictCounts(f, gasMult, plan) {
  const c = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  for (const o of R) {
    const sl = 1000 * o.mult * DROP0 * o.odds * f;
    const net = sl * (plan / 1000) - (2 * o.gas * gasMult + plan * 0.001) - plan * 0.04 * (HZ / 52);
    c[net > THR ? 'FARM' : net < -THR ? 'SKIP' : 'MARGINAL']++;
  }
  return c;
}

// ---------- table ----------
const COLS = [
  ['rank', '#', o => o.rank], ['name', 'Protocol', o => o.name], ['tvl', 'TVL', o => fmtS(o.tvl)],
  ['chg', '7d %', o => o.g === null ? '—' : rN(o.g, 1) + '%'],
  ['age', 'Age', o => o.age === null ? '—' : o.age],
  ['mult', 'Mult', o => rN(o.mult, 2) + 'x'], ['imp', 'Implied', o => fmt$(o.imp)],
  ['jk', 'Range (jk+)', o => fmtS(o.jkLo) + '–' + fmtS(o.jkHi)],
  ['odds', 'Odds', o => o.odds], ['tier', 'Tier', o => o.tier],
  ['verdict', 'Verdict', o => o.verdict], ['net', 'Net $', o => fmt$(o.net)],
  ['netH', 'Net/h', o => '$' + rN(o.net / 6, 2)], ['fee', 'Fee', o => fmt$(o.fee)],
  ['be', 'Break-even', o => o.be === null ? 'never' : fmt$(o.be)],
  ['walk', 'Walk', o => rN(o.walk, 2) + 'x'], ['conv', 'Conv', o => o.conv],
  ['evc', 'EV/cost', o => rN(o.evcost, 2) + 'x'], ['launch', 'Launch', o => o.launch],
  ['gshare', 'Gas %', o => rN(o.gshare, 0) + '%'], ['fval', 'Farm val', o => '$' + rN(o.fval, 2)],
  ['rr', 'Rank rng', o => o.rLo + '–' + o.rHi],
];
const SORTV = { rank: o => o.rank, name: o => o.name, tvl: o => o.tvl, chg: o => o.g === null ? -999 : o.g, age: o => o.age === null ? -1 : o.age, mult: o => o.mult, imp: o => o.imp, jk: o => o.jkHi - o.jkLo, odds: o => o.odds, tier: o => o.tier, verdict: o => o.verdict, net: o => o.net, netH: o => o.net, fee: o => o.fee, be: o => o.be === null ? 1e12 : o.be, walk: o => o.walk, conv: o => o.conv, evc: o => o.evcost, launch: o => o.launch, gshare: o => o.gshare, fval: o => o.fval, rr: o => o.rHi - o.rLo };
let visible = new Set(['rank', 'name', 'tvl', 'chg', 'age', 'mult', 'imp', 'jk', 'odds', 'verdict', 'net', 'netH']);
let sortKeys = [['rank', 1]];
let showAll = false;
const flaggedSet = (() => {
  const s = new Set();
  R.slice(0, 10).forEach(o => s.add(o.slug));
  const byName = {}; R.forEach(o => byName[o.name] = o.slug);
  M.bb.bearSurvivors.forEach(n => { if (byName[n]) s.add(byName[n]); });
  R.filter(o => o.verdict === 'FARM' && (o.walk < 2 || o.costs > o.net)).forEach(o => s.add(o.slug));
  return s;
})();
function filtered() {
  const q = ($('q').value || '').toLowerCase(), v = $('fVerdict').value, t = $('fTier').value, c = $('fCat').value;
  let list = R.filter(o => (!q || o.name.toLowerCase().includes(q) || o.slug.includes(q)) && (!v || o.verdict === v) && (!t || o.tier === t) && (!c || o.cat === c) && (!$('fWatch').checked || o.watch) && (!$('fGrey').checked || o.grey));
  if (!showAll) list = list.filter(o => flaggedSet.has(o.slug));
  for (const [k, dir] of [...sortKeys].reverse()) {
    list = [...list].sort((a, b) => { const va = SORTV[k](a), vb = SORTV[k](b); return (va < vb ? -1 : va > vb ? 1 : a.rank - b.rank) * dir; });
  }
  return list;
}
function renderTable() {
  const head = $('board').querySelector('thead'), body = $('board').querySelector('tbody'), foot = $('board').querySelector('tfoot');
  const sk = Object.fromEntries(sortKeys);
  head.innerHTML = '<tr>' + COLS.map(([k, label]) => `<th data-k="${k}" class="${visible.has(k) ? '' : 'hidecol'}">${label}${sk[k] ? ' ' + (sk[k] > 0 ? '▲' : '▼') : ''}</th>`).join('') + '</tr>';
  const list = filtered();
  body.innerHTML = list.map(o => '<tr data-slug="' + o.slug + '">' + COLS.map(([k, , fn]) => {
    const v = fn(o);
    const cls = (k === 'verdict' ? o.verdict : '') + (visible.has(k) ? '' : ' hidecol');
    const cell = k === 'name' ? `<a href="#detail=${o.slug}">${o.name}</a>${o.watch ? '<span class="badge">W</span>' : ''}${o.grey ? '<span class="badge">grey</span>' : ''}${o.extrap ? '<span class="badge">extrap</span>' : ''}` : v;
    return `<td class="${cls}">${cell}</td>`;
  }).join('') + '</tr>').join('');
  const tot = list.reduce((s, o) => s + o.imp, 0);
  foot.innerHTML = `<tr><td colspan="6">${list.length} of 198 · total ${fmt$(tot)}</td><td colspan="6"></td></tr>`;
  head.querySelectorAll('th').forEach(th => th.onclick = ev => {
    const k = th.dataset.k;
    const ex = sortKeys.find(s => s[0] === k);
    if (ev.shiftKey) { if (ex) ex[1] *= -1; else sortKeys.push([k, 1]); }
    else sortKeys = ex ? [[k, ex[1] * -1]] : [[k, 1]];
    renderTable();
  });
  body.querySelectorAll('tr').forEach(tr => tr.onclick = () => { location.hash = '#detail=' + tr.dataset.slug; });
}
function renderChooser() {
  $('chooser').innerHTML = COLS.map(([k, label]) => `<label><input type="checkbox" data-k="${k}" ${visible.has(k) ? 'checked' : ''}> ${label}</label>`).join('');
  $('chooser').querySelectorAll('input').forEach(cb => cb.onchange = () => {
    if (cb.checked) visible.add(cb.dataset.k); else visible.delete(cb.dataset.k);
    renderTable();
  });
}
function renderKpi() {
  const t = M.tot, v = M.vc;
  $('kpi').innerHTML =
    `<div><b>198</b><span>RANKED · 40/40 WATCH</span></div><div><b>${fmtS(t.total)}</b><span>IMPLIED VALUE</span></div>` +
    `<div><b>x/${M.models.A.medWF}</b><span>MISS · MED WF</span></div>` +
    `<div><b>${Math.round(M.terc.covIn[0] * 100)}/${Math.round(M.terc.covIn[1] * 100)}/${Math.round(M.terc.covIn[2] * 100)}%</b><span>RANGE HOLDS · INNER/TERCILE</span></div>` +
    `<div><b>${M.odds.tp.high * 100}%/${M.odds.tp.med * 100}%/${M.odds.tp.low * 100}%</b><span>LAUNCH ODDS · WF-TESTED</span></div>` +
    `<div><b>${v.FARM}/${v.MARGINAL}/${v.SKIP}</b><span>WORTH FARMING · F/M/S</span></div>`;
}
function renderTiles() {
  const top3 = [...R].filter(o => o.verdict === 'FARM').sort((a, b) => b.net / 6 - a.net / 6).slice(0, 3);
  const tiles = top3.map(o => `<div class="tile"><b>${o.name}</b><span>net ${fmt$(o.net)} · $${rN(o.net / 6, 2)}/h · odds ${o.odds} ${o.tier}</span></div>`).join('');
  const extra = `<div class="tile"><b>${fmtS(M.tot.top10)}</b><span>top-10 implied · median ${fmtS(M.tot.median)}</span></div>` +
    `<div class="tile"><b>${M.cap}x cap · ${M.capB} bound</b><span>p90 multiple · max ${M.maxMult}x</span></div>` +
    `<div class="tile"><b>${M.grey} grey-zone</b><span>above $50M floor, off watchlist</span></div>`;
  $('tiles').innerHTML = tiles + extra +
    `<div class="tile" style="grid-column:span 12"><b style="font-size:13px">Top 10: </b><span style="display:inline;font-size:12px;color:var(--tx)">${M.narrative}</span></div>`;
  $('flagbox').innerHTML = `<b>ROBUST/FRAGILE:</b> ${M.bb.bearSurvivors.length} FARM survive bear x0.33 (${M.bb.bearSurvivors.join(', ')}) · ${M.d04.fragile} FARM fragile (walk-away &lt;2x) · ${M.dn.worse} FARM lose more on DQ than they gain · ${M.extrap} rows extrapolated (outside traded range)`;
  $('d34line').innerHTML = `<b>Watchlist token status (D-34):</b> ${M.d34.tokenTrades} TOKEN TRADES · ${M.d34.preToken} PRE-TOKEN of ${M.d34.total} — snapshot records no token for any watchlist row; full 40-row strip in Evidence.`;
  $('integrity').textContent = `Integrity: table = board.json recomputed here · ranks 1–198 · total ${fmt$(M.tot.total)} · ledger ${M.disp.join('/')} = 758 · Rebuild MATCH ${R.filter(o => rebuild(o) === o.imp).length}/198`;
}
function renderSim() {
  const hair = +$('simHair').value / 100, drop = +$('simDrop').value / 100;
  $('simHairV').textContent = $('simHair').value + '%'; $('simDropV').textContent = $('simDrop').value + '%';
  const c = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  const scored = R.map(o => {
    const sl = 1000 * (o.imp * (1 - hair) / o.tvl) * drop * o.odds;
    const net = sl * (PLAN / 1000) - o.costs;
    c[net > THR ? 'FARM' : net < -THR ? 'SKIP' : 'MARGINAL']++;
    return { o, net };
  }).sort((a, b) => b.net - a.net);
  $('simOut').textContent = `Haircut ${$('simHair').value}% + drop ${$('simDrop').value}% → FARM ${c.FARM} / MARGINAL ${c.MARGINAL} / SKIP ${c.SKIP} · top: ${scored[0].o.name} ${fmt$(scored[0].net)} · ${scored[1].o.name} ${fmt$(scored[1].net)} · ${scored[2].o.name} ${fmt$(scored[2].net)}`;
}

// ---------- detail view ----------
function renderDetail(slug) {
  const o = bySlug[slug];
  if (!o) { $('detail').innerHTML = ''; return; }
  const rb = rebuild(o);
  const steps = farmSteps(o);
  const conf = `Data: ${o.conf}/100` + (o.age === null ? ' — no listing date' : '') + ((o.g === null || o.g === undefined) ? ' — no 7d change' : '');
  $('detail').innerHTML = `<h2>${o.name} <span style="color:var(--amb)">#${o.rank} · ${fmt$(o.imp)} implied</span></h2>
  <p>${o.cat || '—'} · ${o.chains.join(', ') || 'no chain'} · TVL ${fmt$(o.tvl)} · 7d ${o.g === null ? '—' : o.g + '%'} · age ${o.age === null ? 'unknown' : o.age + 'd'} · multiple ${rN(o.mult, 2)}x · ${o.comps} comps · ${conf}</p>
  <p><b>Rebuild:</b> inputs x coefficients = ${fmt$(rb)} — <b>${rb === o.imp ? 'MATCH' : 'MISMATCH ' + fmt$(rb)}</b> · cap ${M.cap}x (${M.capB} rows bound) · tercile ${o.terc + 1} · jackknife+ band ${fmt$(o.jkLo)}–${fmt$(o.jkHi)} (main) · conformal band in Evidence.</p>
  <dl><dt>Odds</dt><dd>${o.odds} ${o.tier} (WF-tested)</dd><dt>Verdict</dt><dd class="${o.verdict}">${o.verdict} · net ${fmt$(o.net)} · $${rN(o.net / 6, 2)}/h</dd><dt>Fee</dt><dd>${fmt$(o.fee)} · cheapest ${o.cheap} $${o.gas}/tx</dd><dt>Break-even</dt><dd>${o.be === null ? 'never' : fmt$(o.be)}</dd><dt>Walk-away</dt><dd>${rN(o.walk, 2)}x TVL</dd><dt>EV/cost</dt><dd>${rN(o.evcost, 2)}x</dd><dt>Conviction</dt><dd>${o.conv}/100</dd><dt>Launch</dt><dd>${o.launch}/70</dd><dt>Gas share</dt><dd>${rN(o.gshare, 0)}% (${o.gverdict}, ${o.chains[0] || '—'})</dd><dt>Farm value</dt><dd>$${rN(o.fval, 2)}${o.half ? ' · half-size (TVL &lt;−10%)' : ''}</dd><dt>Rank rng</dt><dd>#${o.rLo}–#${o.rHi} (p10–p90, 200 refits)</dd><dt>Signals</dt><dd>${o.signals.join(', ') || 'none'} · tier ${o.tierCap}</dd></dl>
  <h3>Farm plan</h3><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>
  <p>Verdict does not price eligibility risk: a launch does not guarantee you qualify.</p>
  <h3>Pool calculator D-10</h3><p>Pool $ <input id="poolIn" type="number" value="1000000"> · dep $ <input id="depIn" type="number" value="5000000"> · cap $ <input id="capIn" type="number" value="5000"> <button id="poolBtn">Compute</button> <span id="poolOut"></span></p>
  <p id="poolNote">Default pool $1,000,000 → payout $1,000, net $949, fixed costs $51.</p>`;
  $('poolBtn').onclick = () => {
    const pool = +$('poolIn').value, dep = +$('depIn').value, cap = +$('capIn').value;
    const pay = pool * Math.min(1, cap / Math.max(1, dep));
    const net = pay - o.costs;
    $('poolOut').textContent = `payout ${fmt$(pay)} · net ${fmt$(net)} · fixed costs ${fmt$(o.costs)}`;
  };
}
// ---------- odds panel + stress + evidence + calendar ----------
function renderOdds() {
  const od = M.odds, tp = od.tp;
  const rows = od.cuts.map(c => `<tr><td>WF ${Math.round(c.cut * 100)}/${Math.round((1 - c.cut) * 100)}</td><td>${c.brier}</td><td>${c.baseBrier}</td><td>${Math.round(c.calledRight * 100)}%</td></tr>`).join('');
  $('oddsPanel').innerHTML = `<div class="ev"><h2>Launch odds — ensemble 50/30/20</h2>
  <div class="cards">
  <div class="card"><b>HIGH ${Math.round(tp.high * 100)}%</b> <span>66 rows · WF rate, pooled</span></div>
  <div class="card"><b>MED ${Math.round(tp.med * 100)}%</b> <span>66 rows · WF rate, pooled</span></div>
  <div class="card"><b>LOW ${Math.round(tp.low * 100)}%</b> <span>66 rows · WF rate, pooled</span></div></div>
  <p>Tiers = tertiles of board odds (cutoffs ${od.cutLo}/${od.cutHi}), NOT a probability this row tokens. Beats base rate on all 3 WF cuts. Base ${od.baseRate}.</p>
  <table><tr><th>Cut</th><th>Brier</th><th>Base</th><th>Called</th></tr>${rows}</table>
  <p>Break-even D-03: ${M.d03.finite} finite / ${M.d03.never} never · median ${fmt$(M.d03.median)} · p10 ${fmt$(M.d03.p10)} · p90 ${fmt$(M.d03.p90)} · max ${fmt$(M.d03.max)}. Walk-away D-04 (FARM): median ${M.d04.median}x · p10 ${M.d04.p10}x · p90 ${M.d04.p90}x · fragile ${M.d04.fragile} · robust ${M.d04.robust}.</p></div>`;
  const st = $('stress');
  st.innerHTML = `<div class="ev"><h3>What-if (live)</h3>
  <p>Vesting D-47 (PV on slice): <select id="vestSel"><option value="1">none</option><option value="0.926">typical 0.926</option><option value="0.707">harsh PV 0.707</option><option value="0.954">generous PV 0.954</option></select>
  Wallets D-51: <select id="walSel"><option value="1">1 wallet</option><option value="4">4 wallets</option></select>
  Bear/bull: <select id="bbSel"><option value="1">base x1</option><option value="0.33">bear x0.33</option><option value="2.5">bull x2.5</option><option value="3">bull x3</option></select>
  Log-share plan: <select id="lsSel"><option value="5000">$5K</option><option value="1000">$1K</option><option value="25000">$25K</option></select>
  <span id="stressOut"></span></p>
  <p id="stressMeta">Base ${vc(M.vc)} · typical ${vc(M.vest.typical)} · harsh ${vc(M.vest.harsh)} · 4-wallet ${vc(M.mw)} · bear ${vc(M.bb.bear033)} · bull x2.5 ${vc(M.bb.bull25)} · bull x3 ${vc(M.bb.bull30)} · log-share $1K ${vc(M.ls.k1)} · $5K ${vc(M.ls.k5)} · $25K ${vc(M.ls.k25)} · DQ downside median −${fmt$(M.dn.medianDown)} vs upside +${fmt$(M.dn.medianUp)} · ${M.dn.worse} FARM lose more on DQ than they gain.</p></div>`;
  const upd = () => {
    const f = +$('vestSel').value * +$('bbSel').value;
    const plan = +$('lsSel').value;
    const lsF = Math.log(1 + plan / 1000) / (plan / 1000);
    const c = verdictCounts(f * lsF, +$('walSel').value, plan);
    $('stressOut').textContent = `→ FARM ${c.FARM} / MARGINAL ${c.MARGINAL} / SKIP ${c.SKIP}`;
  };
  ['vestSel', 'walSel', 'bbSel', 'lsSel'].forEach(id => $(id).onchange = upd);
  upd();
}
function evTable(head, rows) {
  return `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
}
function renderEvidence() {
  const t = M.terc, jk = M.jk, m = M.models;
  const modRows = [['A lam30', m.A.medLoo, m.A.meanLoo, m.A.medWF, m.A.meanWF, m.A.new35med], ['B lam3', m.B.medLoo, m.B.meanLoo, m.B.medWF, m.B.meanWF, m.B.new35med], ['C pow 0.45', m.C.medLoo, m.C.meanLoo, m.C.medWF, m.C.meanWF, m.C.new35med], ['D-24 OLS+shift', m.D24.medLoo, m.D24.meanLoo, m.D24.medWF, m.D24.meanWF, m.D24.new35med], ['kurva', m.curve.medLoo, m.curve.meanLoo, m.curve.medWF, m.curve.meanWF, m.curve.new35med], ['flat med', m.flat.medLoo, m.flat.meanLoo, m.flat.medWF, m.flat.meanWF, m.flat.new35med], ['placebo', m.placebo.medLoo, m.placebo.meanLoo, m.placebo.medWF, m.placebo.meanWF, m.placebo.new35med]];
  const tercRows = [0, 1, 2].map(i => [`T${i + 1} (TVL ${i === 0 ? '≤' + fmtS(t.cuts[0]) : i === 1 ? fmtS(t.cuts[0]) + '–' + fmtS(t.cuts[1]) : '>' + fmtS(t.cuts[1])}, n=${t.counts[i]})`, 'x' + t.kIn[i], 'x' + t.kOut[i], Math.round(t.covIn[i] * 100) + '%', Math.round(t.covOut[i] * 100) + '%', Math.round(t.singleCovIn[i] * 100) + '%', Math.round(t.singleCovOut[i] * 100) + '%']);
  const d34rows = R.filter(o => o.watch).map(o => `<span style="display:inline-block;border:1px solid var(--line);padding:1px 5px;margin:1px">${o.name} · PRE-TOKEN</span>`).join(' ');
  $('evidence').innerHTML = `<div class="ev">
  <h2>1 · Model selection (frozen rule: lowest mean WF; &lt;0.10x → lowest median LOO; tie → B)</h2>
  <p>Rule picks A. Lambda by inner-LOO: ${M.iLoo.map(r => `${Math.round(r.cut * 100)}% lam10 x/${r.lam10} vs lam30 x/${r.lam30}`).join(' · ')}. R² ${M.r2} · logTVL slope ${M.slope} · growth coef negative (r=−0.13, D-05) — fast growth does NOT raise value.</p>
  ${evTable(['Model', 'med LOO', 'mean LOO', 'med WF', 'mean WF', 'newest-35'], modRows)}
  <p>D-24 beats A on mean WF by ${(m.A.meanWF - m.D24.meanWF).toFixed(3)}x (noise) but loses median WF (${m.D24.medWF} vs ${m.A.medWF}) — NOT adopted (D-40). Curve duel D-52: top-1 ${M.curveB.top1} ${fmt$(M.curveB.top1Usd)}, total ${fmt$(M.curveB.total)}, Spearman ${M.curveB.spearman}, top-10 overlap ${M.curveB.top10Overlap}/10 — curve loses mean WF, not adopted. Flat ≈ A on LOO (${m.flat.medLoo} vs ${m.A.medLoo}); A wins only ~10% on WF (D-06). Placebo med LOO x/${m.placebo.medLoo} — the control works.</p>
  <h2>2 · Range calibration per tercile (HERO v14 — fixes D-41)</h2>
  <p>Single-factor band under-covered the middle tercile (v11 inner 40/30/73%). Per-tercile widening factors are searched on WF residuals (3 cuts), one pair per tercile, applied to that tercile's rows. Coverage measured on the same WF folds (e).</p>
  ${evTable(['Tercile', 'k in', 'k out', 'inner', 'outer', 'single in', 'single out'], tercRows)}
  <p>Clean-cut (n=${t.cleanTerc.n}, train 67% oldest, test newest 31): single inner ${Math.round(t.cleanSingle.inCov * 100)}% / outer ${Math.round(t.cleanSingle.outCov * 100)}% → per-tercile inner ${Math.round(t.cleanTerc.inCov * 100)}% / outer ${Math.round(t.cleanTerc.outCov * 100)}%. Calibration fixes the ACCURACY of the uncertainty, not the point estimate — model A error is unchanged.</p>
  <h2>3 · Jackknife+ — the MAIN band (D-45)</h2>
  <p>Validation (train 67% oldest n=61, test n=31): inner ${Math.round(jk.valIn * 100)}% (x/${jk.valWidthIn}) · outer ${Math.round(jk.valOut * 100)}% (x/${jk.valWidthOut}) · per tercile inner ${jk.valTerc.map(x => 'n=' + x.n + ' ' + Math.round(x.inCov * 100) + '%').join(' · ')}. Board band (full 92 LOO models): median width x/${jk.boardWidthIn} — wider than conformal (half-widths x/${t.kIn.join('/')}) but higher, more even coverage. Conformal per-tercile band stays as companion (detail + board.json).</p>
  <h2>4 · Time-split D-02 (second protocol)</h2>
  <p>Single chronological split: train listed before ${M.d02.cutoff} (n=${M.d02.nTrain}), test after (n=${M.d02.nTest}): median x/${M.d02.med} · mean x/${M.d02.mean}. Compare 3-cut WF median x/${m.A.medWF} / mean x/${M.models.A.meanWF}, LOO median x/${m.A.medLoo} / mean x/${m.A.meanLoo}. D-02 is a SECOND protocol, not a replacement for LOO/WF — newest cohort noisier (D-41).</p>
  <h2>5 · Watchlist token status D-34 (strip)</h2>
  <p>${M.d34.tokenTrades} TOKEN TRADES · ${M.d34.preToken} PRE-TOKEN of ${M.d34.total} watchlist rows, read from the sealed snapshot (a row records no token when gecko_id and symbol are both null; not proof a token does not exist). Every strip row is verifiable in board.json (watchlist + token_status).</p>
  <p>${d34rows}</p>
  <h2>6 · Negative controls (not adopted)</h2>
  <p>Mondrian (no widening): inner ${Math.round(M.mondrian.inCov * 100)}% / outer ${Math.round(M.mondrian.outCov * 100)}% on cut-3 — pool too small per tercile, not adopted (R-20). CQR-lite: inner ${Math.round(M.cqr.inCov * 100)}% (x/${M.cqr.widthIn}) / outer ${Math.round(M.cqr.outCov * 100)}% (x/${M.cqr.widthOut}) — needs more data than n=36, not adopted. D-25 prior, D-26 asymmetric growth, D-38 widening: tested and rejected (mean WF worse / overshoots outer).</p>
  <h2>7 · Economics D-03/D-04/D-47–D-51</h2>
  <p>D-03/D-04 above. Vesting PV on slice: typical 0.926 → ${vc(M.vest.typical)}; harsh 0.707 → ${vc(M.vest.harsh)}; generous 0.954 → ${vc(M.vest.generous)}. Bear x0.33 → ${M.bb.bear033.FARM} survive (${M.bb.bearSurvivors.join(', ')}); bull x2.5 → ${M.bb.bull25.FARM}; bull x3 → ${M.bb.bull30.FARM}. Log-share: $1K ${vc(M.ls.k1)}, $5K ${vc(M.ls.k5)}, $25K ${vc(M.ls.k25)}. EV/cost D-50: median ${M.d50.median}x · p90 ${M.d50.p90}x · max ${M.d50.max}x · ${M.d50.gt1} &gt;1x · ${M.d50.gt3} &gt;3x. Multi-wallet D-51: ${vc(M.mw)}.</p>
  <h2>8 · Gas-share D-55 + farm value D-56 + launch score D-53 + confidence D-54</h2>
  <p>Gas-share (first chain): ${M.d55.counts.FARM} FARM / ${M.d55.counts.THIN} THIN / ${M.d55.counts.SKIP} SKIP · median ${M.d55.median}% · max ${M.d55.max}%. Farm value: median $${M.d56.median} · max $${M.d56.max} · ${M.d56.half} half-size. Launch score (age+size only, D-05): median ${M.d53.median} · p10 ${M.d53.p10} · p90 ${M.d53.p90} · max ${M.d53.max}. Confidence: ${M.d54.full} rows 100, ${M.d54.partial} rows 70. Conviction D-33: median ${M.conv.median} · top ${M.conv.top5.map(x => x.name + ' ' + x.score).join(', ')}.</p>
  <h2>9 · Bootstrap ranks D-22</h2>
  <p>200 refits: median p90–p10 rank width ${M.boot.widthMed} · top-20 stability ${Math.round(M.boot.top20Stab * 100)}% (target ≥80% — MISSED, as-is). Ranks are wide because the signal is weak (D-06); bands, not point ranks, carry the uncertainty.</p>
  <h2>10 · Signals D-57 + disposition D-62</h2>
  <p>Signals: ${Object.keys(M.d57.signals).map(k => k + ' ' + M.d57.signals[k]).join(' · ')} · ${M.d57.zeroSignals} rows with none. Tiers: early ${M.d57.tiers.early} · mid ${M.d57.tiers.mid} · large ${M.d57.tiers.large} · institutional ${M.d57.tiers.institutional}. Disposition (758): ranked 198 / has-token 416 / bridges ${M.disp[2]} / staking ${M.disp[3]} / CEX ${M.disp[4]} / versioned ${M.disp[5]} / wrapped-word ${M.disp[6]} / exchange-name ${M.disp[7]} = 758.</p>
  <h2>11 · Category medians D-28</h2>
  <p>${M.catM.map(c => c.cat + ' ' + c.med + 'x (n=' + c.n + ')').join(' · ')}. Global median multiple ${M.flatM}x; 72% of comps trade below 1x TVL.</p>
  <h2>12 · Literature + caveats (D-35/D-36/D-75, D-37/D-39/D-40/D-61)</h2>
  <p>TVL/MC does not predict returns (Soiman et al., arXiv:2204.00251); Metcalfe elasticity ~0.6 at chain level, weaker at protocol level (Spearman 0.352). Conformal coverage is fragile under regime drift (Soloviov) — our bands are calibrated on WF folds, not guaranteed on new data. No revenue in snapshot. Watchlist is a floor, not a ceiling (D-39). Old without a token may have chosen not to launch (D-61). Only calibration changed in v14 (D-40); model, rank key, odds, verdicts unchanged from v11.</p>
  </div>`;
}
function renderCalendar() {
  $('cal').innerHTML = `<div class="ev"><h2>Harvest calendar D-11 — 7 sessions</h2>
  <p>${M.calRows} FARM rows (7 chains with most FARM, top 5 each by net/hour) · net ${fmt$(M.calNet)} in ${M.calHrs}h · 0.5h/row/week, gas batched once per session.</p>
  <div class="cal">${M.cal.map(c => `<div><b>${c.day} · ${c.chain}</b><br>${c.n} rows · net ${fmt$(c.net)} · ${c.hours}h</div>`).join('')}</div></div>`;
}
// ---------- tabs / hash / exports / init ----------
function showTab(t) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('tab-board').hidden = t !== 'board'; $('tab-evidence').hidden = t !== 'evidence'; $('tab-calendar').hidden = t !== 'calendar';
  if (t === 'evidence') { renderOdds(); renderEvidence(); }
  if (t === 'calendar') renderCalendar();
}
function route() {
  const h = location.hash;
  const dm = h.match(/#detail=([\w-]+)/);
  if (dm) { showTab('board'); renderDetail(dm[1]); setTimeout(() => $('detail').scrollIntoView(), 50); return; }
  const vm = h.match(/#verdict=(FARM|MARGINAL|SKIP)/);
  if (vm) { $('fVerdict').value = vm[1]; showTab('board'); renderTable(); return; }
  if (h === '#tab=evidence') { showTab('evidence'); return; }
  if (h === '#tab=calendar') { showTab('calendar'); return; }
  showTab('board'); renderTable();
}
function exportJSON() {
  const blob = new Blob([JSON.stringify({ meta: M, rows: R.map(o => ({ slug: o.slug, name: o.name, rank: o.rank, implied_value_usd: o.imp, odds: o.odds, verdict: o.verdict, net_usd: o.net, farm_steps: farmSteps(o) })) }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'board.json'; a.click();
}
function exportCSV() {
  const head = 'rank,slug,name,tvl_usd,implied_value_usd,odds,tier,verdict,net_usd\n';
  const body = R.map(o => [o.rank, o.slug, '"' + o.name.replace(/"/g, '""') + '"', o.tvl, o.imp, o.odds, o.tier, o.verdict, rN(o.net, 2)].join(',')).join('\n');
  const blob = new Blob([head + body + '\n'], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'board.csv'; a.click();
}
(function init() {
  const cats = [...new Set(R.map(o => o.cat))].sort();
  $('fCat').innerHTML = '<option value="">Category</option>' + cats.map(c => `<option>${c}</option>`).join('');
  renderKpi(); renderTiles(); renderChooser(); renderTable(); renderSim();
  ['q', 'fVerdict', 'fTier', 'fCat', 'fWatch', 'fGrey'].forEach(id => $(id).addEventListener('input', renderTable));
  $('chooserBtn').onclick = () => { $('chooser').hidden = !$('chooser').hidden; };
  $('densityBtn').onclick = () => { document.body.classList.toggle('dense'); document.body.classList.toggle('roomy'); };
  $('showAllBtn').onclick = () => { showAll = true; $('showAllBtn').textContent = 'All 198 shown'; renderTable(); };
  $('simHair').oninput = renderSim; $('simDrop').oninput = renderSim;
  $('expJson').onclick = exportJSON; $('expCsv').onclick = exportCSV;
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  window.addEventListener('hashchange', route);
  route();
})();
