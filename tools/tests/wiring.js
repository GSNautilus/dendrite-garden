// T2: projection wiring (docs/phase1-plan.md §6). Eval script for tools/cdp.mjs against cortex.html#debug.
// Optional before it: window.TP_PRESET (default 'tadpole1'), window.TP_SEED (default 1).
// - crossCheck() == 0 at build and after 3000 steps with rewiring on
// - every projection fills at least 80% of its quota (projStats)
// - every non-empty synapse's bouton node lies within CONTACT_R (+0.01) of its compartment
// - projection delays are within 1 step of delay + local path / AX_VEL
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms)), out = {};
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const realRandom = Math.random;
  cg.pause(true);
  Math.random = cg.mulberry32(window.TP_SEED || 1);
  await cg.applyPreset(window.TP_PRESET || 'tadpole1');
  Math.random = realRandom;
  const net = cg.net, K = net.K, AXN = 64, C = 32, R = 1.7 + 0.01;
  out.N = net.N; out.classes = net.circuit.classes;
  out.cross0 = await cg.crossCheck();
  // geometry and delays, from the slots as built on the GPU
  const a = await cg.rawSynA(); let far = 0, live = 0, worst = 0, badDelay = 0, projSyn = 0, capped = 0;
  for (let s = 0; s < net.NS; s++) {
    const z = a[s * 4 + 2]; if (((z >>> 17) & 3) === 2) continue;
    live++;
    const pre = a[s * 4], comp = a[s * 4 + 1], node = (z >>> 10) & 63, o = (pre * AXN + node) * 4, p = net.pos[pre];
    const q = [p[0] + net.axn[o], p[1] + net.axn[o + 1], p[2] + net.axn[o + 2]];
    const d = Math.hypot(q[0] - net.cw[comp * 3], q[1] - net.cw[comp * 3 + 1], q[2] - net.cw[comp * 3 + 2]);
    worst = Math.max(worst, d); if (d > R) far++;
    const pj = net.arbOf[pre * AXN + node];
    if (pj) {
      projSyn++;
      const P = net.circuit.projections[pj - 1], w = net.axn[o + 3], path = w - Math.floor(w / 4096) * 4096, root = (P.delay - 1) * 0.7;
      const want = (P.delay + (path - root + d) / 0.7) / 0.5, got = z & 63;
      if (got === 62 && want > 62) capped++; else if (Math.abs(got - want) > 1) badDelay++;
    }
  }
  out.geometry = { live, far, worst: +worst.toFixed(3), projSyn, badDelay, capped };
  out.proj = await cg.projStats();
  out.minFill = Math.min(...out.proj.map(p => p.fill));
  cg.P.rewire = 1;
  await cg.run(3000);
  out.cross3000 = await cg.crossCheck();
  out.rates = await cg.groupRates(500);
  cg.P.rewire = 1;
  const e = document.getElementById('err');
  out.err = e && !e.hidden ? e.textContent : null;
  out.pass = out.cross0 === 0 && out.cross3000 === 0 && out.minFill >= 80 && far === 0 && badDelay === 0;
  return JSON.stringify(out);
})()
