// Brush paints: Excite, Inhibit and the chemical cloud, on the default specimen (Cortex-like).
// Eval script for tools/cdp.mjs against cortex.html#debug:
//   node tools/cdp.mjs "file:///.../cortex.html#debug" 2 out.png "$(cat tools/tests/brush.js)"
// Paused, rewiring off. Each case paints at its own spot on screen, so no case inherits another's history (a strong
// Excite pushes homeostasis down for seconds after). Each counts every spike over 1024 steps (512 ms) of the cells whose
// soma is inside the ball, and of a shell around it (one to two radii), first while only hovering, then while painting.
// B2 excite, B3 inhibit: rates inside well above the hover rate, and ~0.
// B4 noradrenaline (default receptor: louder output): the cloud fills the ball, cells inside carry an output gain > 1,
//    their rate is unchanged, and after the brush lifts the cloud decays with tau 1.5 s (after 3 s ≈ e^-2 = 0.135×).
// B5 dopamine with the D1 receptor on every type (excite + learn): rates inside rise, and stay up while the cloud lingers.
// B6 the cloud dies 5 taus after the last stroke.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(500);
  cg.pause(true); cg.P.rewire = 0; cg.P.brushSize = 10; cg.P.brushStrength = 7; cg.VIS.autoRotate = false;   // a spinning camera moves the ball
  const N = cg.net.N, out = {}, cx = innerWidth / 2, cy = innerHeight / 2;
  const pc = n => cg.net.pos[n].map(v => v * (1 + cg.VIS.exH * 0.6));
  const pop = x => { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
  const u32 = f => new Uint32Array(f.buffer);
  async function count(steps) {   // spikes per cell, from the 64-step history bits
    const c = new Float64Array(N);
    for (let d = 0; d < steps; d += 64) { await cg.run(64); const h = u32(await cg.rawState()); for (let n = 0; n < N; n++) c[n] += pop(h[n * 16 + 12]) + pop(h[n * 16 + 13]); }
    return c;
  }
  function zones() {   // 0 inside the ball, 1 in the shell around it
    const b = cg.brush.c, r = cg.P.brushSize, z = new Int8Array(N).fill(-1);
    for (let n = 0; n < N; n++) { const p = pc(n), d = Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]); z[n] = d < r ? 0 : d < 2 * r ? 1 : -1; }
    return z;
  }
  const hz = (c, z, k) => { let s = 0, m = 0; for (let n = 0; n < N; n++) if (z[n] === k) { s += c[n]; m++; } return +(s / Math.max(1, m) / 0.512).toFixed(2); };
  const half = h => { const e = (h >> 10) & 31, f = h & 1023; return e ? (1 + f / 1024) * 2 ** (e - 15) : f / 1024 * 2 ** -14; };
  async function gains(z) { const s = u32(await cg.rawState()); let og = 0, lm = 0, m = 0; for (let n = 0; n < N; n++) if (z[n] === 0) { og += half(s[n * 16 + 15] & 65535); lm += half(s[n * 16 + 15] >>> 16); m++; } return { gain: +(og / m).toFixed(3), learn: +(lm / m).toFixed(3) }; }
  // hover at (x, y), then paint there; z is fixed from the hover position (the ball sits in the same place while painting)
  async function at(name, x, y, paint, extra) {
    // the ball is placed by the frame loop: wait for a frame that has placed it at this spot (and, below, that paints)
    const prev = cg.brush.c.join();
    cg.setPaint(paint); cg.paintAt(null); cg.hover(x, y);
    for (let i = 0; i < 100 && !(cg.brush.show && cg.brush.c.join() !== prev); i++) await sleep(50);
    await sleep(200); const c0 = cg.brush.c.slice();
    const z = zones(), r = { cells: z.filter(v => v === 0).length };
    let c = await count(1024); r.hover = { inside: hz(c, z, 0), shell: hz(c, z, 1) };
    cg.paintAt(x, y);
    for (let i = 0; i < 100 && !cg.brush.on; i++) await sleep(50);
    r.moved = +Math.hypot(...cg.brush.c.map((v, k) => v - c0[k])).toFixed(2);
    c = await count(1024); r.paint = { inside: hz(c, z, 0), shell: hz(c, z, 1) };
    cg.paintAt(null); cg.hover(null);
    for (let i = 0; i < 100 && cg.brush.on; i++) await sleep(50);
    if (extra) await extra(r, z);
    out[name] = r;
  }
  await at('B2_excite', cx + 160, cy, 'excite');
  await at('B3_inhibit', cx - 160, cy, 'inhibit');
  await at('B4_NA', cx, cy - 140, 'NA', async (r, z) => {
    r.atLift = { cloud: (await cg.cloud()).NA, ...(await gains(z)) };
    await count(6016);   // ~3 s
    r.after3s = { cloud: (await cg.cloud()).NA };
  });
  const keep = cg.CT.map(t => t.receptors);
  cg.CT.forEach(t => { t.receptors = { DA: 'D1' }; }); await sleep(100);
  await at('B5_DA_D1', cx, cy + 140, 'DA', async (r, z) => {
    r.atLift = { cloud: (await cg.cloud()).DA, ...(await gains(z)) };
    const c = await count(1024); r.lingering = { inside: hz(c, z, 0), shell: hz(c, z, 1), cloud: (await cg.cloud()).DA };
  });
  cg.CT.forEach((t, i) => { t.receptors = keep[i]; });
  cg.setPaint('excite');
  const c6 = await cg.cloud();
  await cg.run(Math.ceil((c6.until - c6.t) / 0.5 / 64) * 64 + 64);
  const c7 = await cg.cloud();
  out.B6 = { aliveBefore: c6.alive, aliveAfter: c7.alive, DAafter: c7.DA };
  out.err = document.getElementById('err').hidden ? null : document.getElementById('err').textContent;
  return JSON.stringify(out);
})()
