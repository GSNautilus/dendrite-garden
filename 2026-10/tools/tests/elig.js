// Phase 3 CP3.2: unit tests of the dopamine-gated eligibility trace on the hidden eligProbe preset (docs/phase3-plan.md §7.2).
// Eval script for tools/cdp.mjs against cortex.html#debug, e.g. (Git Bash):
//   CDP_PORT=9335 node tools/cdp.mjs "file:///.../cortex.html#debug" 2 out.png "$(cat tools/tests/elig.js)"
// A → B eligible (B has a dopamine learning receptor), A → C not eligible (same receptor), A → D eligible (no receptor).
// Pairing: A kicked, then B, C and D kicked lag ms later, 10 times at 10 Hz. Dopamine: clampMod on B, C, D.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms)), real = Math.random, out = {};
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  const T = ['B', 'C', 'D'];
  const fresh = async (seed = 1) => { cg.pause(true); Math.random = cg.mulberry32(seed); cg.P.rewire = 0; await cg.applyPreset('eligProbe'); Math.random = real; await cg.run(400); };
  const pair = async (n = 10, preFirst = true, lag = 8) => {
    for (let i = 0; i < n; i++) {
      if (preFirst) { cg.kickGroup('A', 40, 3); await cg.run(lag * 2); cg.kickGroup(T, 40, 2); await cg.run(200 - lag * 2); }
      else { cg.kickGroup(T, 40, 2); await cg.run(lag * 2); cg.kickGroup('A', 40, 3); await cg.run(200 - lag * 2); }
    }
  };
  const pulse = async (L = 2, ms = 300) => { cg.clampMod(T, 'DA', L); await cg.run(ms * 2); cg.clampMod(T, 'DA', 0); await cg.run(200); cg.clampMod(T, 'DA', null); };
  const st = async () => ({ AB: await cg.eligStats('A', 'B'), AC: await cg.eligStats('A', 'C'), AD: await cg.eligStats('A', 'D') });

  // E1: analytic decay. Pair, then stay silent: every consolidation step re-decays the stored trace from its timestamp
  await fresh(); cg.clampMod(T, 'DA', 0); await pair();
  const e1 = await cg.rawElig(); await cg.run(2000); const e2 = await cg.rawElig();
  let worst = 0, k = 0;
  for (let s = 0; s < e1.length / 4; s++) {
    const c1 = e1[s * 4], c2 = e2[s * 4]; if (Math.abs(c1) < 1e-4) continue; k++;
    const want = c1 * Math.exp(-(e2[s * 4 + 1] - e1[s * 4 + 1]) / 1000), rel = Math.abs(c2 - want) / Math.abs(want); if (rel > worst) worst = rel;
  }
  out.E1 = { traced: k, worstRel: worst, dtMs: e2.find((v, i) => i % 4 === 1 && v > 0) - e1.find((v, i) => i % 4 === 1 && v > 0), pass: k > 100 && worst < 1e-5 };

  // E2: no dopamine (held at 0), and dopamine below theta (0.15: signal 0.69 < 1): lasting weight exactly unchanged
  let s0 = await st();
  out.E2 = { afterPairDA0: s0, pass0: s0.AB.lasting === 0 && s0.AB.fluid === 0 && s0.AD.lasting === 0 && s0.AC.fluid !== 0 };
  await fresh(); cg.clampMod(T, 'DA', 0.15); await pair(); await cg.run(1000); s0 = await st();
  out.E2.lowDA = s0; out.E2.passLow = s0.AB.lasting === 0;

  // E3: sign. Pre before post, then a dopamine pulse: lasting up. Post before pre: down
  await fresh(); cg.clampMod(T, 'DA', 0); await pair(10, true, 15); const c3 = await st(); cg.clampMod(T, 'DA', null); await pulse(); const a3 = await st();
  await fresh(); cg.clampMod(T, 'DA', 0); await pair(10, false, 2); const c3b = await st(); cg.clampMod(T, 'DA', null); await pulse(); const b3 = await st();
  out.E3 = { prePost: { c: c3.AB.c, lasting: a3.AB.lasting }, postPre: { c: c3b.AB.c, lasting: b3.AB.lasting }, pass: c3.AB.c.mean > 0.02 && a3.AB.lasting > 0.002 && c3b.AB.c.mean < -0.02 && b3.AB.lasting < -0.002 };

  // E4: distal reward: the same pairing, dopamine 0, 0.5 or 4 s later
  const dz = [];
  for (const wait of [0, 500, 4000]) { await fresh(); cg.clampMod(T, 'DA', 0); await pair(); await cg.run(wait * 2); cg.clampMod(T, 'DA', null); await pulse(); dz.push((await cg.eligStats('A', 'B')).lasting); }
  out.E4 = { lasting: dz, r500: dz[1] / dz[0], r4000: dz[2] / dz[0], pass: Math.abs(dz[1] / dz[0] - Math.exp(-0.5)) < 0.2 * Math.exp(-0.5) && dz[2] / dz[0] < 0.05 };

  // E5 / E6: after the E4 runs' last pulse: the non-eligible A → C keeps ordinary fluid STDP and its trace stays empty;
  // the eligible but deaf A → D has a trace and no lasting change
  const s5 = await st();
  out.E5 = { AC: s5.AC, pass: s5.AC.fluid !== 0 && s5.AC.cStored === 0 && s5.AB.fluid === 0 };
  out.E6 = { AD: s5.AD, pass: s5.AD.lasting === 0 && s5.AD.cStored !== 0 };

  // T-exact: the same pairing and pulse, dense against event-driven synapses
  const hs = [];
  for (const ev of [false, true]) { cg.P.eventSyn = ev; await fresh(); await pair(); await pulse(); await cg.run(1000); hs.push(await cg.checksum()); }
  cg.P.eventSyn = true;
  out.Texact = { dense: hs[0], event: hs[1], pass: JSON.stringify(hs[0]) === JSON.stringify(hs[1]) };
  const e = document.getElementById('err'); out.err = e && !e.hidden ? e.textContent : null;
  return JSON.stringify(out);
})()
