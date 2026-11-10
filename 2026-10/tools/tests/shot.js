// Screenshot helper for the Tadpole preset. Eval script for tools/cdp.mjs; set window.SHOT first, e.g.
//   window.SHOT = { yaw: -1.5708, pitch: 0.05, dist: 1, lens: 'types', ui: false, ms: 4000 }
// yaw/pitch in radians (orbit), dist as a multiple of the preset's default distance, lens 'garden' or 'types',
// preset (default 'tadpole1'), ui false hides the panels, kick { key, amp, ms, wait } kicks a group live. Runs the simulation for ms before the shot.
(async () => {
  const cg = window.__cg, S = Object.assign({ yaw: 0.7, pitch: 0.32, dist: 1, lens: 'garden', ui: true, ms: 4000, seed: 1 }, window.SHOT || {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const realRandom = Math.random;
  Math.random = cg.mulberry32(S.seed);
  await cg.applyPreset(S.preset || 'tadpole1');
  Math.random = realRandom;
  cg.setLens(S.lens);
  const o = cg.orbit; o.yaw = S.yaw; o.pitch = S.pitch; o.dist *= S.dist;
  if (S.target) o.target = S.target;
  if (!S.ui) { document.body.classList.add('ui-hidden'); document.getElementById('dock').style.display = 'none'; }
  cg.pause(false);
  for (const k of [].concat(S.kick || [])) { await sleep(k.wait || 1500); cg.kickGroup(k.key, k.amp, k.ms); }   // e.g. kick: { key: 'touch', amp: 7, ms: 300 }, or a list of them
  await sleep(S.ms);
  const e = document.getElementById('err');
  return JSON.stringify({ dist: o.dist, target: o.target, err: e && !e.hidden ? e.textContent : null, rates: cg.rates() });
})()
