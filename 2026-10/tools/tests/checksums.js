// T0: old presets must stay checksum()-identical (docs/phase1-plan.md §6).
// Eval script for tools/cdp.mjs against cortex.html#debug, e.g. from Git Bash:
//   CDP_PORT=9335 node tools/cdp.mjs "file:///.../cortex.html#debug" 2 out.png "$(cat tools/tests/checksums.js)"
// Optional before it (in the same eval string): window.T0_JOBS = [...] and/or window.T0_PROFILE = false.
// Each job: pause, seed Math.random with mulberry32(seed), rewiring off, applyPreset, run 2000 steps, checksum().
// All jobs run in one page, one after another. Returns JSON: { results: [{ key, seed, N, hash }], profile, err }.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const jobs = window.T0_JOBS || [
    ['cortex', 1], ['hippo', 1], ['rhythm', 1], ['waves', 1], ['shells', 1], ['random', 1], ['random', 2], ['random', 3]];
  const realRandom = Math.random, out = { results: [] };
  cg.pause(true);
  for (const [key, seed] of jobs) {
    Math.random = cg.mulberry32(seed);
    cg.NET.size = 30000; cg.P.rewire = 0;
    await cg.applyPreset(key);
    await cg.run(2000);
    out.results.push({ key, seed, N: cg.net.N, hash: await cg.checksum() });
  }
  Math.random = realRandom;
  if (window.T0_PROFILE !== false) {
    // Cortex-like at 30k, three profile() calls of 5 reps each
    Math.random = cg.mulberry32(1); cg.P.rewire = 0;
    await cg.applyPreset('cortex'); Math.random = realRandom;
    await cg.run(200);
    out.profile = [];
    for (let i = 0; i < 3; i++) out.profile.push(await cg.profile(5));
  }
  cg.P.rewire = 1;
  const e = document.getElementById('err');
  out.err = e && !e.hidden ? e.textContent : null;
  return JSON.stringify(out);
})()
