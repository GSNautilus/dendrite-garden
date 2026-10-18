// Phase 3 behaviour tests on the full Tadpole (docs/phase3-plan.md §7.3). Eval script for tools/cdp.mjs against cortex.html#debug.
// Optional before it:
//   window.TUNE = { types: { 'Pump chatterer': { excite: 2 } }, proj: { 'food>feed': { strength: 3 } }, groups: { feed: { homeo: 0.05 } },
//                   local: { 'Pump chatterer>Pump chatterer': 6 }, elig: {...} }
//   window.T3 = { seed: 1, only: ['B0', 'B1', 'B3a', 'B3b', 'B5', 'B6'], touch: 7, food: 7, light: 7, kickMs: 300, boutS: 25 }
// Each test starts from a fresh build (same wiring; Math.random seeded with T3.seed for the initial state) and 2000 steps
// of warm-up. Rates are group rates in 10 ms bins (pools include their basket cells); "on" > 15 Hz, "off" < 2 Hz.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const T = window.TUNE || {}, S = Object.assign({ seed: 1, only: ['B0', 'B1', 'B3b', 'B3a', 'B5', 'B6'], touch: 7, food: 7, light: 3, lightKey: 'eye', foodKey: 'food', touchKey: 'touch', kickMs: 300, boutS: 25 }, window.T3 || {});
  const pr = cg.PRESETS.tadpole, orig = { types: pr.types, projections: pr.projections, groups: pr.groups, localStrength: pr.localStrength, elig: pr.elig };
  const out = { tune: T, S };
  const fresh = async () => {
    pr.types = () => orig.types().map(t => Object.assign(t, (T.types || {})[t.name] || {}));
    pr.projections = orig.projections.map(p => Object.assign({}, p, (T.proj || {})[`${p.from}>${[].concat(p.to).join(',')}`] || {}));
    pr.groups = orig.groups.map(g => Object.assign({}, g, (T.groups || {})[g.key] || {}));
    pr.localStrength = Object.assign({}, orig.localStrength, T.local || {});
    pr.elig = Object.assign({}, orig.elig, T.elig || {});
    const realRandom = Math.random; cg.pause(true); cg.P.rewire = 1;
    Math.random = cg.mulberry32(S.seed);
    try { await cg.applyPreset('tadpole'); } finally { Math.random = realRandom; Object.assign(pr, orig); }
    await cg.run(2000);
  };
  const keys = () => cg.net.circuit.groups.map(g => g.key);
  const mean = (a, i0, i1) => { const v = a.slice(Math.max(0, i0), i1); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0; };
  const sum250 = a => Array.from({ length: Math.ceil(a.length / 25) }, (_, i) => +mean(a, i * 25, (i + 1) * 25).toFixed(1));
  const first = (a, f, from = 0) => { for (let i = from; i < a.length; i++) if (f(a[i])) return i; return -1; };
  // a trace of `ms` (10 ms bins) while running `plan`: [[atMs, keys, amp, durMs], ...] kicks, applied in time order
  const traced = async (ms, plan = []) => {
    const tr = Object.fromEntries(keys().map(k => [k, []])); let t = 0;
    const ev = plan.slice().sort((a, b) => a[0] - b[0]);
    while (t < ms) {
      while (ev.length && ev[0][0] <= t) { const [, k, amp, d] = ev.shift(); cg.kickGroup(k, amp, d); }
      const step = Math.min(ev.length ? ev[0][0] - t : ms - t, ms - t, 250);
      const part = await cg.groupTrace(Math.round(step / 0.5), 20);
      for (const k of Object.keys(tr)) tr[k].push(...part[k]);
      t += step;
    }
    return tr;
  };
  // the pump: autocorrelation peak (period) between 200 and 2000 ms, pulses (runs above half the 95th percentile) and the
  // peak/trough ratio in 50 ms bins
  const pulses = a => {
    const n = a.length, m = mean(a, 0, n); let best = -Infinity, period = 0;
    for (let lag = 20; lag < Math.min(n / 2, 200); lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += (a[i] - m) * (a[i + lag] - m); s /= n - lag; if (s > best) { best = s; period = lag * 10; } }
    const b50 = Array.from({ length: Math.floor(n / 5) }, (_, i) => mean(a, i * 5, i * 5 + 5)), srt = b50.slice().sort((x, y) => x - y);
    const hi = srt[Math.floor(0.9 * (srt.length - 1))], lo = srt[Math.floor(0.1 * (srt.length - 1))], thr = 0.5 * srt[Math.floor(0.95 * (srt.length - 1))];
    let runs = 0, on = false; for (const v of a) { if (!on && v > thr) { runs++; on = true; } else if (on && v < 0.5 * thr) on = false; }
    return { period, pulses: runs, peakTrough: +(hi / Math.max(lo, 0.5)).toFixed(1), mean: +m.toFixed(1), hi: +hi.toFixed(1), lo: +lo.toFixed(1) };
  };
  if (S.only.includes('B0')) {
    await fresh();
    out.proj = (await cg.projStats()).map(p => `${p.proj} ${p.fill}%`).join(', ');
    out.cross = await cg.crossCheck();
    const r = out.rest = await cg.groupRates(3000);
    const long = await cg.groupRates(17000); out.rest20 = long;
    out.B0 = { pass: r.brake >= 30 && r.brake <= 80 && r.fbrake >= 30 && r.fbrake <= 80 && r.command < 1 && r.pump < 1 && ['swim', 'feed', 'gate', 'fgate', 'cS', 'cF'].every(k => r[k] < 2 && long[k] < 2) && ['touch', 'light', 'food'].every(k => r[k] < 3), tailRest: [r.rhythmL, r.rhythmR] };
  }
  if (S.only.includes('B1')) {
    await fresh(); const rest = await cg.groupRates(1000);
    const tr = await traced(4500, [[0, 'touch', S.touch, S.kickMs]]);
    const gateOn = first(tr.gate, v => v > 10), brakeLow = gateOn < 0 ? -1 : first(tr.brake, v => v < 0.2 * rest.brake, gateOn) - gateOn;
    out.B1 = { swim: sum250(tr.swim), feed: sum250(tr.feed), cS: sum250(tr.cS), cF: sum250(tr.cF), command: sum250(tr.command), pump: sum250(tr.pump),
      swimHeld: mean(tr.swim, 80, 330), brakeLowMs: brakeLow < 0 ? null : brakeLow * 10 };
    out.B1.pass = out.B1.swimHeld > 15 && Math.min(...tr.swim.slice(80, 330)) > 5 && brakeLow >= 0 && brakeLow <= 15 && Math.max(...out.B1.feed) < 2 && Math.max(...out.B1.pump) < 2;   // feed and pump in 250 ms bins
  }
  if (S.only.includes('B3b')) {
    await fresh(); const rest = await cg.groupRates(1000);
    const tr = await traced(4000, [[0, 'food', S.food, S.kickMs]]);
    const lv = await cg.modLevels();
    const on = first(tr.feed, v => v > 15);
    const p = pulses(tr.pump.slice(100, 400));
    out.B3b = { feed: sum250(tr.feed), swim: sum250(tr.swim), fbrake: sum250(tr.fbrake), pump: sum250(tr.pump), vta: sum250(tr.vta), feedOnMs: on * 10, pump3s: p, DAfeed: lv.feed && lv.feed.DA,
      fbrakeLow: mean(tr.fbrake, 50, 400) < 0.2 * rest.fbrake };
    // does the bout end by itself?
    let endS = null;
    out.B3b.boutTrace = [];
    for (let s = 4; s <= S.boutS; s++) { const r = await cg.groupRates(1000), l = await cg.modLevels(); out.B3b.boutTrace.push([s, r.feed, r.sraphe ?? r.raphe, l.feed ? l.feed['5HT'] : 0].map(v => +(+v).toFixed(2))); if (r.feed < 2) { endS = s; break; } }
    out.B3b.boutEndsS = endS;
    out.B3b.pass = on >= 0 && on <= 30 && mean(tr.feed, 100, 400) > 10 && Math.min(...tr.feed.slice(100, 400)) > 5 && Math.max(...tr.swim) < 2 && out.B3b.fbrakeLow &&
      p.period >= 300 && p.period <= 1500 && p.pulses >= 3 && p.peakTrough >= 3 && (out.B3b.DAfeed || 0) >= 0.6 && endS !== null;
  }
  if (S.only.includes('B3a')) {
    await fresh(); const rest = await cg.groupRates(1000);
    const tr = await traced(6000, [[0, S.touchKey, S.touch, S.kickMs], [2000, S.foodKey, S.food, S.kickMs]]);
    const f0 = 200, on = first(tr.feed, v => v > 15, f0) - f0, sOff = first(tr.swim, v => v < 2, f0) - f0;
    out.B3a = { swim: sum250(tr.swim), feed: sum250(tr.feed), cS: sum250(tr.cS), cF: sum250(tr.cF), brake: sum250(tr.brake), command: sum250(tr.command),
      feedOnMs: on * 10, swimOffMs: sOff * 10, swimLater: mean(tr.swim, f0 + 100, 600), feedLater: mean(tr.feed, f0 + 100, 600) };
    out.B3a.pass = on >= 0 && on <= 30 && sOff >= 0 && sOff <= 50 && out.B3a.swimLater < 2 && out.B3a.feedLater > 10 && mean(tr.brake, f0 + 100, 600) >= 0.7 * rest.brake;
  }
  if (S.only.includes('B5')) {
    await fresh();
    const tr = await traced(2200, [[0, S.lightKey, S.light, 1000], [1000, [S.lightKey, 'touch'], S.light, 300], [1300, S.lightKey, S.light, 700]]);
    const before = mean(tr.light, 50, 100), during = mean(tr.light, 105, 130), after = mean(tr.light, 150, 200);
    out.B5 = { light: sum250(tr.light), tgate: sum250(tr.tgate), before: +before.toFixed(1), during: +during.toFixed(1), after: +after.toFixed(1) };
    out.B5.pass = during <= 0.3 * before && after >= 0.7 * before;
    // control: the Touch gate lesioned
    await fresh(); cg.lesionGroup('tgate');
    const tc = await traced(1400, [[0, S.lightKey, S.light, 1000], [1000, [S.lightKey, 'touch'], S.light, 300]]);
    out.B5.lesioned = { before: +mean(tc.light, 50, 100).toFixed(1), during: +mean(tc.light, 105, 130).toFixed(1) };
    out.B5.passControl = out.B5.lesioned.during >= 0.8 * out.B5.lesioned.before;
  }
  if (S.only.includes('B2')) {
    // a long swim gives up by itself (Phase 2's T7b in the full specimen): one touch, then Swim per second for 60 s; and
    // the same with the raphe lesioned, which should keep swimming
    out.B2 = {};
    for (const lesion of [false, true]) {
      await fresh(); if (lesion) cg.lesionGroup('raphe');
      cg.kickGroup(S.touchKey, S.touch, S.kickMs);
      const tr = []; let stop = null;
      for (let s = 1; s <= 60; s++) { const r = await cg.groupRates(1000); tr.push(Math.round(r.swim)); if (stop === null && s > 3 && r.swim < 2) stop = s; if (stop !== null && s >= stop + 5) break; }
      const lv = await cg.modLevels();
      out.B2[lesion ? 'lesioned' : 'intact'] = { swim: tr.join(' '), stopS: stop, fiveHT: lv.swim && lv.swim['5HT'] };
    }
    out.B2.pass = out.B2.intact.stopS !== null && out.B2.intact.stopS <= 60 && out.B2.lesioned.stopS === null;
  }
  if (S.only.includes('B6')) {
    out.B6 = [];
    for (const sd of S.tieSeeds || [S.seed, S.seed + 1]) {
      const s0 = S.seed; S.seed = sd; await fresh(); S.seed = s0;
      const tr = await traced(1500, [[0, ['touch', 'food'], S.touch, S.kickMs]]);
      const sw = mean(tr.swim, 110, 150), fe = mean(tr.feed, 110, 150);
      out.B6.push({ seed: sd, swim: +sw.toFixed(1), feed: +fe.toFixed(1), one: (sw > 10 && fe < 2) || (fe > 10 && sw < 2), winner: sw > fe ? 'swim' : 'feed' });
    }
  }
  const e = document.getElementById('err'); out.err = e && !e.hidden ? e.textContent : null;
  return JSON.stringify(out);
})()
