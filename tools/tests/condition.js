// Phase 3 B4: conditioning on the full Tadpole (docs/phase3-plan.md §7.4). Eval script for tools/cdp.mjs against cortex.html#debug.
// Optional before it: window.CND = { seed: 1, control: 'paired' | 'unpaired' | 'novta' | 'nolearn' | 'forget', pairs: 5,
//   iti: 15000, pre: 3, post: 5, light: 3, food: 7, foodAt: 400, unpairedAt: 6000 }  and window.TUNE as in tadpole3.js.
// A probe is Light alone (the eye kicked for 600 ms): Feed's peak (10 ms bins, 50 ms smoothing) in the first second, and
// mean 1.0–1.5 s after onset (after Light has ended) and the pump's peak. Success: peak > 20 Hz, > 10 Hz at 1.0–1.5 s (a latch:
// Feed outlasts the Light) and the pump fires (> 50 Hz); satiety ends such bouts in ~1.5–5 s. Before training every
// probe must stay below 5 Hz with no latch. A pairing: Light 0–600 ms, Food (300 ms) at 400 ms; 'unpaired' gives the
// same Food 6 s after Light (the trace has decayed by then); 'novta' lesions the VTA during training; 'nolearn' sets
// Learning to 0 during training; 'forget' trains, then presses Clear memories before the post-test.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const T = window.TUNE || {}, S = Object.assign({ seed: 1, control: 'paired', pairs: 5, iti: 15000, pre: 3, post: 5, light: 3, food: 7, foodAt: 400, unpairedAt: 6000 }, window.CND || {});
  const pr = cg.PRESETS.tadpole, orig = { types: pr.types, projections: pr.projections, groups: pr.groups, localStrength: pr.localStrength, elig: pr.elig };
  pr.types = () => orig.types().map(t => Object.assign(t, (T.types || {})[t.name] || {}));
  pr.projections = orig.projections.map(p => Object.assign({}, p, (T.proj || {})[`${p.from}>${[].concat(p.to).join(',')}`] || {}));
  pr.groups = orig.groups.map(g => Object.assign({}, g, (T.groups || {})[g.key] || {}));
  pr.localStrength = Object.assign({}, orig.localStrength, T.local || {});
  pr.elig = Object.assign({}, orig.elig, T.elig || {});
  const realRandom = Math.random, lr0 = cg.P.lr; cg.pause(true); cg.P.rewire = 1;
  Math.random = cg.mulberry32(S.seed);
  try { await cg.applyPreset('tadpole'); } finally { Math.random = realRandom; Object.assign(pr, orig); }
  await cg.run(2000 + Math.round((S.settle ?? 4000) / 0.5));   // warm-up, then a few seconds of rest before the first probe
  const out = { S, tune: T, t0: cg.simT };
  const mean = (a, i0, i1) => { const v = a.slice(Math.max(0, i0), i1); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0; };
  // run `ms` in 10 ms bins with kicks [[atMs, key, amp, durMs]], keeping only some groups' traces
  const traced = async (ms, plan) => {
    const want = ['feed', 'swim', 'light', 'pump', 'vta'], tr = Object.fromEntries(want.map(k => [k, []])); let t = 0;
    const ev = plan.slice().sort((a, b) => a[0] - b[0]);
    while (t < ms) {
      while (ev.length && ev[0][0] <= t) { const [, k, amp, d] = ev.shift(); cg.kickGroup(k, amp, d); }
      const step = Math.min(ev.length ? ev[0][0] - t : ms - t, ms - t, 500);
      const part = await cg.groupTrace(Math.round(step / 0.5), 20);
      for (const k of want) tr[k].push(...part[k]);
      t += step;
    }
    return tr;
  };
  const probe = async () => {
    const tr = await traced(3000, [[0, 'eye', S.light, 600]]);
    const sm = tr.feed.map((_, i) => mean(tr.feed, i - 2, i + 3));
    const peak = Math.max(...sm.slice(0, 100)), held = mean(tr.feed, 100, 150), late = mean(tr.feed, 200, 300), pump = Math.max(...tr.pump.slice(0, 300));
    await cg.run(Math.round((S.iti - 3000) / 0.5));
    return { peak: +peak.toFixed(1), held: +held.toFixed(1), late: +late.toFixed(1), pump: Math.round(pump), swimPeak: +Math.max(...tr.swim.slice(0, 300)).toFixed(1), light: +mean(tr.light, 0, 60).toFixed(1), ok: peak > 20 && held > 10 && pump > 50 };
  };
  const el = async () => { const f = await cg.eligStats('light', 'feed'), s = await cg.eligStats('light', 'swim'); return { feed: { c: f.c.mean, lasting: f.lasting }, swim: { c: s.c.mean, lasting: s.lasting } }; };
  out.pre = []; for (let i = 0; i < S.pre; i++) out.pre.push(await probe());
  out.preOk = out.pre.every(p => p.peak < 5 && p.held < 2);
  if (S.control === 'novta') cg.lesionGroup('vta');
  if (S.control === 'nolearn') cg.P.lr = 0;
  out.train = []; out.w0 = await el();
  for (let i = 0; i < S.pairs; i++) {
    const fa = S.control === 'unpaired' ? S.unpairedAt : S.foodAt;
    const tr = await traced(Math.max(1500, fa + 1200), [[0, 'eye', S.light, 600], [fa, 'food', S.food, 300]]);
    const e1 = await el(), lv = await cg.modLevels();
    const prof = []; for (let ms = Math.max(1500, fa + 1200); ms < S.iti; ms += 1000) { const r1 = await cg.groupRates(Math.min(1000, S.iti - ms)); prof.push(Math.round(r1.feed)); }
    const e2 = await el(), r = { feed: prof[prof.length - 1] };
    out.train.push({ feedPeak: +Math.max(...tr.feed).toFixed(1), DA: lv.feed && lv.feed.DA, at1s: e1, end: e2, feedAtEnd: r.feed, prof: prof.join(" ") });
  }
  if (S.control === 'novta') cg.lesionGroup('vta', false);
  if (S.control === 'nolearn') cg.P.lr = lr0;
  if (S.control === 'forget') { cg.clearMem(); await cg.run(400); }
  out.w1 = await el();
  out.post = []; for (let i = 0; i < S.post; i++) out.post.push(await probe());
  out.postOk = out.post.filter(p => p.ok).length;
  out.dW = { feed: +(out.w1.feed.lasting - out.w0.feed.lasting).toFixed(4), swim: +(out.w1.swim.lasting - out.w0.swim.lasting).toFixed(4) };
  out.simS = +((cg.simT - out.t0) / 1000).toFixed(1);
  const e = document.getElementById('err'); out.err = e && !e.hidden ? e.textContent : null;
  cg.P.lr = lr0;
  return JSON.stringify(out);
})()
