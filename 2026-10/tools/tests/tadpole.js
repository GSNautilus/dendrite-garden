// Circuit tests for the Tadpole preset (docs/phase1-plan.md §6). Eval script for tools/cdp.mjs against cortex.html#debug.
// CP2: T1 (exact group counts, no cell inside another group's shape) and crossCheck() == 0, before and after
// 3000 steps with rewiring on; then leaving the preset must restore its scoped settings.
// Optional before it: window.TP_SEED (Math.random seed, default 1), window.TP_SIZE (cell count, default the preset's 15000).
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const realRandom = Math.random, out = {};
  const before = { fanIn: cg.NET.fanIn, size: cg.NET.size, exH: cg.VIS.exH, lod: cg.VIS.lod };
  cg.pause(true);
  Math.random = cg.mulberry32(window.TP_SEED || 1);
  const t0 = performance.now();
  await cg.applyPreset('tadpole1');
  if (window.TP_SIZE) { cg.NET.size = window.TP_SIZE; await cg.rebuild(); }
  Math.random = realRandom;
  out.buildMs = Math.round(performance.now() - t0);
  out.N = cg.net.N; out.NS = cg.net.NS; out.contactsPerCell = +(cg.net.contacts / cg.net.N).toFixed(1);
  out.groups = cg.groups().map(g => `${g.key} ${g.cells} @${g.centre.join(',')} ${Object.entries(g.types).map(([k, v]) => k + ':' + v).join(' ')}`);
  out.t1 = cg.t1();
  out.cross0 = await cg.crossCheck();
  cg.P.rewire = 1;
  await cg.run(3000);
  out.cross3000 = await cg.crossCheck();
  out.syn = await cg.syn();
  out.scoped = { fanIn: cg.NET.fanIn, size: cg.NET.size, exH: cg.VIS.exH, lod: cg.VIS.lod };
  let e = document.getElementById('err');
  out.err = e && !e.hidden ? e.textContent : null;
  await cg.applyPreset('cortex');
  const after = { fanIn: cg.NET.fanIn, size: cg.NET.size, exH: cg.VIS.exH, lod: cg.VIS.lod };
  out.restored = JSON.stringify(after) === JSON.stringify(before) ? 'yes' : `NO before ${JSON.stringify(before)} after ${JSON.stringify(after)}`;
  return JSON.stringify(out);
})()
