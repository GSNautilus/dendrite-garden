// Neuron and synapse kernel times on Cortex-like at 30k: 8 profile(10) calls, reports min and median (ms per 10 steps).
// Run it interleaved against the 2c79625 file to compare; absolute numbers depend on the GPU's state.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  cg.pause(true); const realRandom = Math.random; Math.random = cg.mulberry32(1); cg.P.rewire = 0;
  await cg.applyPreset(window.PERF_PRESET || 'cortex'); if (window.PERF_SIZE) { cg.NET.size = window.PERF_SIZE; await cg.rebuild(); } Math.random = realRandom; cg.P.rewire = 1;
  await cg.run(200);
  const rows = {};
  for (let i = 0; i < 8; i++) for (const l of (await cg.profile(10)).split('\n')) { const m = l.match(/^(.+?)\s+([\d.]+) ms$/); if (m) (rows[m[1]] = rows[m[1]] || []).push(+m[2]); }
  const st = v => { v = v.slice().sort((a, b) => a - b); return `min ${v[0].toFixed(2)} med ${v[v.length >> 1].toFixed(2)}`; };
  return JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, st(v)])));
})()
