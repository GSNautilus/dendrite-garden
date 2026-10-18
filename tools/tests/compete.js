// CP6b: docs/competition-test.md's X7 with real projections (the 'compete' test preset). Eval script for tools/cdp.mjs.
// Optional before it: window.CMP = { seed: 1, kick: 7, proj: { 'cA>B': { strength: 120 } }, local: {...}, types: {...} }
// Rest 2 s (no ignition), then kick A, B, A, B (250 ms each, 1.75 s apart), traced in 125 ms bins; then a fresh build with
// A and B kicked together. Group rates include the pools' basket cells (~400 Hz while latched), so "off" means ~0 Hz.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const S = Object.assign({ seed: 1, kick: 7, kickMs: 250, recMs: 1750 }, window.CMP || {});
  const pr = cg.PRESETS.compete, orig = { types: pr.types, projections: pr.projections, localStrength: pr.localStrength };
  const build = async () => {
    pr.types = () => orig.types().map(t => Object.assign(t, (S.types || {})[t.name] || {}));
    pr.projections = orig.projections.map(p => Object.assign({}, p, (S.proj || {})[`${p.from}>${p.to}`] || {}));
    pr.localStrength = Object.assign({}, orig.localStrength, S.local || {});
    const realRandom = Math.random; Math.random = cg.mulberry32(S.seed);
    try { await cg.applyPreset('compete'); } finally { Math.random = realRandom; Object.assign(pr, orig); }
  };
  const out = {};
  cg.pause(true); cg.P.rewire = 1;
  await build();
  out.proj = (await cg.projStats()).map(p => `${p.proj} fill ${p.fill}% contacts ${p.contacts}`);
  out.cross = await cg.crossCheck();
  await cg.run(4000);
  out.rest = await cg.groupRates(2000);
  const phase = async keys => {
    cg.kickGroup(keys, S.kick, S.kickMs);
    const tr = await cg.groupTrace(Math.round(S.recMs / 0.5), 250);
    const last = k => +(tr[k].slice(-8).reduce((a, b) => a + b, 0) / 8).toFixed(1);   // the last second
    return { kicked: [].concat(keys).join('+'), A: tr.A.map(Math.round).join(' '), B: tr.B.map(Math.round).join(' '), cA: tr.cA.map(Math.round).join(' '), cB: tr.cB.map(Math.round).join(' '), endA: last('A'), endB: last('B'), endCA: last('cA'), endCB: last('cB') };
  };
  out.seq = [];
  for (const k of ['A', 'B', 'A', 'B']) out.seq.push(await phase(k));
  const on = v => v > 20, off = v => v < 1;
  out.switches = out.seq.map((p, i) => i === 0 ? on(p.endA) && off(p.endB) : (p.kicked === 'A' ? on(p.endA) && off(p.endB) : on(p.endB) && off(p.endA)));
  // winner-take-all from a fresh build
  await build(); await cg.run(4000);
  const both = await phase(['A', 'B']);
  out.both = both; out.wta = (on(both.endA) && off(both.endB)) || (on(both.endB) && off(both.endA));
  const e = document.getElementById('err');
  out.err = e && !e.hidden ? e.textContent : null;
  return JSON.stringify(out);
})()
