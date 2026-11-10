// T3: per-group flags (docs/phase1-plan.md §6), on the Tadpole preset. Eval script for tools/cdp.mjs against cortex.html#debug.
// a) homeostasis 0: every cell's bias in the group is unchanged over 4000 steps (and a homeostasis-1 group does change)
// b) ambient 0 and no input: the group's rate is exactly 0
// c) rewiring 0: the group's slots are unchanged over 3000 steps with P.rewire = 1 (and a rewiring-1 group does change)
// plus kick and lesion sanity checks with groupTrace.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms)), out = {};
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const realRandom = Math.random;
  cg.pause(true);
  Math.random = cg.mulberry32(window.TP_SEED || 1);
  await cg.applyPreset('tadpole1');
  Math.random = realRandom;
  const G = key => cg.net.circuit.groups.find(g => g.key === key), inG = (key, n) => cg.net.group[n] === G(key).id;
  const setFlag = (key, f, v) => { G(key)[f] = v; cg.writeTypes(); };
  // a) homeostasis
  let f0 = await cg.rawState(); await cg.run(4000); let f1 = await cg.rawState();
  const biasDiff = key => { let m = 0; for (let n = 0; n < cg.net.N; n++) if (inG(key, n)) m = Math.max(m, Math.abs(f1[n * 16 + 2] - f0[n * 16 + 2])); return m; };
  out.T3a = { swim: biasDiff('swim'), brake: biasDiff('brake'), rhythmL: biasDiff('rhythmL'), touchHomeo1: biasDiff('touch') };
  // b) ambient 0
  setFlag('swim', 'ambient', 0); setFlag('gate', 'ambient', 0);
  await cg.run(1000);
  out.T3b = await cg.groupRates(1000);
  setFlag('swim', 'ambient', 0.3); setFlag('gate', 'ambient', 0.5);
  // c) rewiring
  cg.P.rewire = 1; setFlag('touch', 'rewire', 1);
  const a0 = await cg.rawSynA(); await cg.run(3000); const a1 = await cg.rawSynA();
  const K = cg.net.K, slotDiff = key => { let c = 0; for (let s = 0; s < cg.net.NS; s++) if (inG(key, (s / K) | 0) && (a0[s * 4] !== a1[s * 4] || a0[s * 4 + 1] !== a1[s * 4 + 1] || a0[s * 4 + 2] !== a1[s * 4 + 2])) c++; return c; };
  out.T3c = { swim: slotDiff('swim'), command: slotDiff('command'), rhythmR: slotDiff('rhythmR'), touchRewire1: slotDiff('touch') };
  setFlag('touch', 'rewire', 0); cg.P.rewire = 0;
  // kick and lesion
  out.rest = await cg.groupRates(500);
  cg.kickGroup('swim', 7, 250);
  out.kickSwim = (await cg.groupTrace(1200, 100)).swim;
  cg.lesionGroup('brake');
  out.lesionBrake = await cg.groupRates(500);
  cg.lesionGroup('brake', false);
  const e = document.getElementById('err');
  out.err = e && !e.hidden ? e.textContent : null;
  return JSON.stringify(out);
})()
