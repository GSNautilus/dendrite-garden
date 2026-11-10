// Phase 3 T-exact: the full Tadpole with conditioning running (one Light + Food pairing, then 3 s), dense synapses against
// event-driven ones, and event-driven twice: all checksums (including the synS eligibility tail and the modulator levels)
// must be identical. Eval script for tools/cdp.mjs against cortex.html#debug.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms)), real = Math.random;
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  const hs = [];
  for (const ev of [false, true, true]) {
    cg.P.eventSyn = ev; cg.pause(true); cg.P.rewire = 0; Math.random = cg.mulberry32(11);
    await cg.applyPreset('tadpole'); Math.random = real;
    await cg.run(4000);
    cg.kickGroup('eye', 3, 600); await cg.run(800); cg.kickGroup('food', 7, 300); await cg.run(6600);
    hs.push(await cg.checksum());
  }
  cg.P.eventSyn = true; cg.P.rewire = 1;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const e = document.getElementById('err');
  return JSON.stringify({ dense: hs[0], event: hs[1], event2: hs[2], pass: same(hs[0], hs[1]) && same(hs[1], hs[2]), err: e && !e.hidden ? e.textContent : null });
})()
