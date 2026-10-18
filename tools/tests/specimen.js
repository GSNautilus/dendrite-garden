// T4–T7 on the Tadpole (docs/phase1-plan.md §6). Eval script for tools/cdp.mjs against cortex.html#debug.
// Optional before it:
//   window.TUNE = { types: { 'Swim command': { excite: 2 } }, proj: { 'brake>command': { strength: 2, slots: 12 } },
//                   groups: { swim: { ambient: 0.3 } }, local: { 'Choice pyramidal>Choice pyramidal': 7 } }
//   window.SPEC = { seed: 1, kick: 7, kickMs: 300, only: 'T4' | 'T5' | ..., lesion: true }
// Returns rates per group at rest (T4), a 10 ms-bin trace after a touch kick (T5–T7, summarised), and pass flags.
(async () => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
  await sleep(300);
  const T = window.TUNE || {}, S = Object.assign({ seed: 1, kickKey: 'touch', kick: 7, kickMs: 300, lesion: true, traceMs: 4500 }, window.SPEC || {});
  // overrides on a copy of the preset
  const pr = cg.PRESETS.tadpole1, orig = { types: pr.types, projections: pr.projections, groups: pr.groups, localStrength: pr.localStrength };
  pr.types = () => orig.types().map(t => Object.assign(t, (T.types || {})[t.name] || {}));
  pr.projections = orig.projections.map(p => Object.assign({}, p, (T.proj || {})[`${p.from}>${p.to}`] || {}));
  pr.groups = orig.groups.map(g => Object.assign({}, g, (T.groups || {})[g.key] || {}));
  pr.localStrength = Object.assign({}, orig.localStrength, T.local || {});
  const out = { tune: T };
  const realRandom = Math.random;
  cg.pause(true); cg.P.rewire = 1;
  Math.random = cg.mulberry32(S.seed);
  try { await cg.applyPreset('tadpole1'); } finally { Math.random = realRandom; Object.assign(pr, orig); }
  const keys = cg.net.circuit.groups.map(g => g.key);
  // T4: at rest (SPEC.preLesion: groups silenced first, for tuning parts of the circuit)
  for (const k of S.preLesion || []) cg.lesionGroup(k);
  await cg.run(2000);
  out.rest = await cg.groupRates(S.restMs || 3000);
  const r = out.rest;
  out.T4 = r.brake >= 30 && r.brake <= 80 && r.command < 1 && r.rhythmL < 1 && r.rhythmR < 1 && r.swim < 2 && r.gate < 2 && r.touch < 3;
  // T5–T7: kick the touch group, trace in 10 ms bins
  cg.kickGroup(S.kickKey, S.kick, S.kickMs);
  const tr = await cg.groupTrace(Math.round(S.traceMs / 0.5), 20);
  const mean = (a, i0, i1) => { const v = a.slice(i0, i1); return +(v.reduce((x, y) => x + y, 0) / Math.max(1, v.length)).toFixed(1); };
  const nb = tr.swim.length, per = 25;   // 250 ms summary bins
  out.trace = Object.fromEntries(keys.map(k => [k, Array.from({ length: Math.ceil(nb / per) }, (_, i) => mean(tr[k], i * per, (i + 1) * per))]));
  const maxOf = a => Math.max(...a);
  const gateOn = tr.gate.findIndex(v => v > 10);
  const brakeRest = r.brake;
  const brakeLow = gateOn >= 0 ? tr.brake.slice(gateOn, gateOn + 15).findIndex(v => v < 0.2 * brakeRest) : -1;
  out.T5 = { swimMax: maxOf(tr.swim), gateMax: maxOf(tr.gate), commandMax: maxOf(tr.command), gateOnMs: gateOn * 10, brakeBelow20pctMs: brakeLow < 0 ? null : brakeLow * 10 };
  out.T5.pass = out.T5.swimMax > 15 && out.T5.gateMax > 10 && out.T5.commandMax > 10 && brakeLow >= 0;
  // T6: alternation over the bout (from 300 ms after the kick to the end)
  const L = tr.rhythmL.slice(30), R = tr.rhythmR.slice(30);
  const corr = (a, b) => { const ma = mean(a, 0, a.length), mb = mean(b, 0, b.length); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0; };
  // the stroke period: the first autocorrelation peak of L after its first zero crossing (lags up to 2 s)
  const ac = lag => corr(L.slice(0, L.length - lag), L.slice(lag));
  let zero = 0; for (let lag = 1; lag < Math.min(200, L.length - 20); lag++) if (ac(lag) < 0) { zero = lag; break; }
  let best = -1, bestLag = 0;
  if (zero) for (let lag = zero; lag < Math.min(200, L.length - 20); lag++) { const c = ac(lag); if (c > best) { best = c; bestLag = lag; } }
  const cycles = bestLag ? L.length / bestLag : 0;
  out.T6 = { corrLR: +corr(L, R).toFixed(2), periodMs: bestLag * 10, acPeak: +best.toFixed(2), cycles: +cycles.toFixed(1), Lmean: mean(L, 0, L.length), Rmean: mean(R, 0, R.length) };
  out.T6.pass = out.T6.corrLR <= -0.3 && out.T6.periodMs >= 100 && out.T6.periodMs <= 800 && cycles >= 3;
  // T7: still swimming 2 s after the kick ended
  const after = Math.round((S.kickMs + 2000) / 10);
  out.T7 = { swimAt2s: mean(tr.swim, after - 25, after), LRat2s: mean(tr.rhythmL, after - 25, after) + mean(tr.rhythmR, after - 25, after) };
  out.T7.pass = out.T7.swimAt2s > 10 && out.T7.LRat2s > 1;
  // causality: lesion the gate, kick again from a fresh build
  if (S.lesion) {
    Math.random = cg.mulberry32(S.seed);
    pr.types = () => orig.types().map(t => Object.assign(t, (T.types || {})[t.name] || {}));
    pr.projections = orig.projections.map(p => Object.assign({}, p, (T.proj || {})[`${p.from}>${p.to}`] || {}));
    pr.groups = orig.groups.map(g => Object.assign({}, g, (T.groups || {})[g.key] || {}));
    pr.localStrength = Object.assign({}, orig.localStrength, T.local || {});
    try { await cg.applyPreset('tadpole1'); } finally { Math.random = realRandom; Object.assign(pr, orig); }
    cg.lesionGroup('gate'); await cg.run(2000);
    cg.kickGroup('touch', S.kick, S.kickMs);
    const t2 = await cg.groupTrace(2000, 20);
    out.lesion = { swimMax: maxOf(t2.swim), commandMax: maxOf(t2.command), commandMean: mean(t2.command, 0, t2.command.length) };
    out.lesion.pass = out.lesion.commandMean < 1;   // the bout average (single 10 ms bins are noisy)
  }
  const e = document.getElementById('err');
  out.err = e && !e.hidden ? e.textContent : null;
  return JSON.stringify(out);
})()
