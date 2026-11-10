// Phase 2 (neuromodulators) tests, docs/phase2-plan.md §5. Eval script for tools/cdp.mjs against cortex.html#debug:
//   CDP_PORT=9335 node tools/cdp.mjs "file:///.../cortex.html#debug" 2 out.png "$(cat tools/tests/mod.js)"
// Put window.MOD_TESTS = ['t1', ...] in front to choose tests (default: all). Returns JSON { test: result }.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms)), out = {}, realRandom = Math.random;
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  cg.pause(true);
  const want = window.MOD_TESTS || ['t1'];
  const fresh = async (key, seed = 1, opts) => { Math.random = cg.mulberry32(seed); cg.P.rewire = 0; await cg.applyPreset(key, opts); Math.random = realRandom; };
  const hz = (counts, cells, ticks) => counts.slice(-ticks).reduce((a, b) => a + b, 0) / (ticks * 2e-3) / cells;
  const cellsOf = key => cg.groups().find(g => g.key === key).cells;

  // T1: levels decay exactly, follow the source's spikes exactly, and runs are reproducible
  if (want.includes('t1')) {
    const r = {};
    await fresh('modtest');
    // a: decay alone (source lesioned, so it can't fire)
    cg.lesionGroup('src', true); await cg.run(400);
    cg.setMod('x', 'NA', 1); cg.setMod('burst', '5HT', 1); await cg.run(4000);
    const L = await cg.modLevels();
    r.decayNA = { got: L.x.NA, want: +Math.exp(-2000 / 1500).toFixed(6) };
    r.decay5HT = { got: L.burst['5HT'], want: +Math.exp(-2000 / 12000).toFixed(6) };
    r.decayPass = Math.abs(L.x.NA / Math.exp(-2000 / 1500) - 1) < 1e-4 && Math.abs(L.burst['5HT'] / Math.exp(-2000 / 12000) - 1) < 1e-4;
    // b: release follows the recorded spike counts tick by tick (the level filter replayed on the CPU)
    cg.lesionGroup('src', false);
    for (const k of ['x', 'burst', 'chat', 'dd']) for (const c of ['DA', 'NA', 'ACh', '5HT']) cg.setMod(k, c, 0);
    const pre = await cg.modLevels();
    cg.kickGroup('src', 6, 6000);
    const tr = await cg.popTrace(16000);
    const Lb = await cg.modLevels(), N = cellsOf('src'), cnt = tr.src;
    const replay = (tau, sat) => { const dec = Math.fround(Math.exp(-4 * 0.5 / tau)), inc = 1000 / (tau * N * sat); let l = 0; for (const c of cnt) l = Math.min(8, l * dec + inc * c); return l; };
    r.release = { NA: { got: Lb.x.NA, replay: +replay(1500, 10).toFixed(5) }, DA: { got: Lb.dd.DA, replay: +replay(3000, 10).toFixed(5) }, '5HT': { got: Lb.burst['5HT'], replay: +replay(12000, 10).toFixed(5) } };
    r.releasePass = ['NA', 'DA', '5HT'].every(k => Math.abs(r.release[k].got / r.release[k].replay - 1) < 1e-3);
    // during the kick the source's rate sets the level at rate / sat: check NA at the kick's end (4 tau in)
    const kickTicks = 3000, rate = hz(cnt.slice(0, kickTicks), N, 750);
    r.kickRate = +rate.toFixed(2); r.preLevels = pre.x;
    r.after = Lb;
    // c: determinism, two builds and runs from the same seed
    const sums = [];
    for (let i = 0; i < 2; i++) { await fresh('modtest'); cg.kickGroup('src', 6, 500); await cg.run(3000); sums.push({ h: await cg.checksum(), L: await cg.modLevels() }); }
    r.deterministic = JSON.stringify(sums[0]) === JSON.stringify(sums[1]);
    r.hash = sums[0].h;
    out.t1 = r;
  }
  // T0b: at zero level the modulators change nothing: held at 0 from the build on, the circuit's simulation state is
  // bit-identical to the same circuit built without its modulate projections (the nucleus still fires either way)
  if (want.includes('t0b')) {
    const r = {}, key = window.T0B_KEY || 'modtest';
    await fresh(key, 1, { modHold: 0 }); cg.kickGroup(cg.groups()[0].key, 10, 300); await cg.run(4000);
    const a = await cg.checksum(); delete a.mod;
    await fresh(key, 1, { stripMods: true }); cg.kickGroup(cg.groups()[0].key, 10, 300); await cg.run(4000);
    const b = await cg.checksum();
    r.withMods = a; r.stripped = b; r.pass = JSON.stringify(a) === JSON.stringify(b);
    out.t0b = r;
  }
  // T6: the cap holds at maximum modulation. Every pattern's bias pinned at its cap, dopamine held at 8 (burst mode,
  // less tiring at gain 2: c +12 mV, d × 1/4), one spike each, then silence required. Control: the cap not lowered.
  if (want.includes('t6')) {
    const r = {}, gs = ['RS', 'IB', 'CH', 'FS', 'LTS', 'TC', 'RZ', 'PH', 'AD', 'RB'].map(p => 'g' + p);
    for (const noCap of [false, true]) {
      await fresh('captest'); cg.noModCap(noCap);
      cg.clampMod(gs, 'DA', 8); await cg.run(8000);
      const st = await cg.state(), fx = await cg.modFx('gCH');
      cg.kickGroup(gs, window.T6_AMP || 80, window.T6_MS || 0.5); const kick = await cg.groupRates(5);
      await cg.run(2000);
      const after = await cg.groupRates(3000);
      r[noCap ? 'control' : 'capped'] = { atCap: st, fxCH: fx['Cap CH'], kickHz: kick, after, silent: gs.filter(g => after[g] === 0) };
      cg.noModCap(false);
    }
    // release: quiet at full strength lets homeostasis pin the stored bias at the plain cap; after release, still silent
    r.pass = r.capped.silent.length === gs.length;
    r.controlFires = gs.filter(g => r.control.after[g] > 0);
    out.t6 = r;
  }
  // T4: noradrenaline (louder output) raises the response to a fixed kick: X kicked five times, X and its target Y counted
  if (want.includes('t4')) {
    const r = {};
    for (const L of [0, 1]) {
      await fresh('modtest', 1, { modHold: 0 }); cg.clampMod('x', 'NA', L);
      await cg.run(2000); const rest = await cg.groupRates(1000);
      let x = 0, y = 0;
      for (let i = 0; i < 5; i++) { cg.kickGroup('x', window.T4_AMP || 3, 200); const tr = await cg.popTrace(600); x += tr.x.reduce((a, b) => a + b, 0); y += tr.y.reduce((a, b) => a + b, 0); await cg.run(1400); }
      r['NA' + L] = { x, y, restX: rest.x, restY: rest.y };
    }
    r.ratioX = +(r.NA1.x / r.NA0.x).toFixed(3); r.ratioY = +(r.NA1.y / r.NA0.y).toFixed(3);
    r.pass = r.ratioY >= 1.3 && r.ratioX >= 1.1 && Math.abs(r.NA1.restX - r.NA0.restX) <= Math.max(0.2, 0.2 * r.NA0.restX);
    out.t4 = r;
  }
  // T5: dopamine excites D1-like cells and quiets D2-like ones, both recover on release, and it speeds learning
  if (want.includes('t5')) {
    const r = {}, tr = async () => { const t = await cg.typeRates(3000); return { D1: t['D1 cell'], D2: t['D2 cell'] }; };
    await fresh('modtest', 1, { modHold: 0 }); cg.clampMod('dd', 'DA', 0); await cg.run(2000);
    r.base = await tr(); r.learn0 = await cg.modLearn('dd');
    cg.clampMod('dd', 'DA', 1); await cg.run(2000); r.DA1 = await tr();
    cg.clampMod('dd', 'DA', 0); await cg.run(8000); r.release = await tr();
    await fresh('modtest', 1, { modHold: 0 }); cg.clampMod('dd', 'DA', 1); await cg.run(2000); await tr(); r.learn1 = await cg.modLearn('dd');
    r.d1Ratio = +(r.DA1.D1 / r.base.D1).toFixed(3); r.d2Ratio = +(r.DA1.D2 / r.base.D2).toFixed(3); r.learnRatio = +(r.learn1.fluid / r.learn0.fluid).toFixed(3);
    r.recovered = Math.abs(r.release.D1 / r.base.D1 - 1) <= 0.15 && Math.abs(r.release.D2 / r.base.D2 - 1) <= 0.15;
    r.pass = r.d1Ratio >= 1.5 && r.d2Ratio <= 0.7 && r.recovered && r.learnRatio >= 2;
    out.t5 = r;
  }
  // T2/T3: serotonin lengthens burst gaps (≥ 1.3×), acetylcholine shortens them (≤ 0.85×) and they still burst. Measured on
  // the network burster (population bursts, 6 s) and on the chatterers' own bursts (six cells, from their soma voltage).
  if (want.includes('t2') || want.includes('t3')) {
    const r = {}, conds = [['base', null, 0], ['5HT', '5HT', 1], ['ACh', 'ACh', 1], ['ACh.5', 'ACh', 0.5]];
    await fresh('modtest', 1, { modHold: 0 });
    const g = cg.groups().find(q => q.key === 'chat'), cells = [];
    for (let n = 0; n < cg.net.N && cells.length < 6; n++) if (cg.net.group[n] === g.id) cells.push(n);
    const cR = cg.PATTERNS.CH.p[2];
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const gaps = v => { const sp = []; v.forEach((x, k) => { if (Math.abs(x - cR) < 1e-3) sp.push(k * 0.5); }); const on = sp.filter((t, i) => i === 0 || t - sp[i - 1] > 12); const ibi = on.slice(1).map((t, i) => t - on[i]);
      const gap = sp.slice(1).map((t, i) => t - sp[i]).filter(d => d > 12);   // silences between bursts
      return { ibi: avg(ibi), gap: avg(gap), perBurst: sp.length / Math.max(1, on.length) }; };
    for (const [nm, chem, L] of conds) {
      cg.clampMod(null, null, 0); if (chem) cg.clampMod(['burst', 'chat'], chem, L);
      await cg.run(3000);
      const net = await cg.burstStats('burst', 12000);
      const cl = []; for (const n of cells) cl.push(gaps(await cg.cellTrace(n, 2000)));
      r[nm] = { net, cellIbi: +(cl.reduce((a, b) => a + b.ibi, 0) / cl.length).toFixed(1), cellGap: +avg(cl.map(c => c.gap)).toFixed(1), cellPerBurst: +(cl.reduce((a, b) => a + b.perBurst, 0) / cl.length).toFixed(2) };
    }
    const B = r.base;
    r.net5HT = +(r['5HT'].net.ibi.mean / B.net.ibi.mean).toFixed(3); r.netACh = +(r.ACh.net.ibi.mean / B.net.ibi.mean).toFixed(3);
    r.cell5HT = +(r['5HT'].cellIbi / B.cellIbi).toFixed(3); r.cellACh = +(r.ACh.cellIbi / B.cellIbi).toFixed(3);
    r.cellGap5HT = +(r['5HT'].cellGap / B.cellGap).toFixed(3); r.cellGapACh = +(r.ACh.cellGap / B.cellGap).toFixed(3); r.cellGapACh5 = +(r['ACh.5'].cellGap / B.cellGap).toFixed(3);
    r.netGap5HT = +(r['5HT'].net.gap / B.net.gap).toFixed(3); r.netACh5 = +(r['ACh.5'].net.ibi.mean / B.net.ibi.mean).toFixed(3); r.netGapACh5 = +(r['ACh.5'].net.gap / B.net.gap).toFixed(3);
    r.t2 = { net: r.net5HT >= 1.3 && r['5HT'].net.n >= 5, cell: r.cell5HT >= 1.3 };
    r.t3 = { net: r.netACh <= 0.85 && r.ACh.net.tonicFrac < 0.6 && r.ACh.net.ibi.cv < 0.6, cell: r.cellACh <= 0.85 && r.ACh.cellPerBurst < 20 };
    out.t23 = r;
  }
  cg.pause(false);
  const e = document.getElementById('err');
  out.err = e && !e.hidden ? e.textContent : null;
  return JSON.stringify(out);
})()
