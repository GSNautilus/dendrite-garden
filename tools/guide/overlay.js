// The Tadpole user's guide: labelled renders of the real specimen. Evaluated in cortex.html#debug by tools/guide/shoot.mjs.
// Defines window.GUIDE: setup(seed) grows the seeded Tadpole, look(name) picks the drawing, frame(angle) aims and fits the
// camera, state(name) holds an input, draw(meta) lays out the labels on a 2D canvas over the render. Drawing only: nothing here
// changes the simulation beyond the input kicks a user's number keys would give.
window.GUIDE = (() => {
  const cg = window.__cg, sleep = ms => new Promise(r => setTimeout(r, ms));
  // what each group is for (tools/guide/groups.json, set as window.GUIDE_INFO by shoot.mjs): subsystem tag, label, job, number key
  const INFO = Object.fromEntries(Object.entries(window.GUIDE_INFO).map(([k, g]) => [k, [g.tag, g.name, g.job, g.key]]));
  const TAGS = { SENSE: '#ffd166', SWIM: '#ff8f6b', FEED: '#9be564', CHOICE: '#c9a3ff', TAIL: '#ff7ad9', MOD: '#7fd8ff' };
  const TAG_NAME = { SENSE: 'senses', SWIM: 'swim path', FEED: 'feed path', CHOICE: 'competition', TAIL: 'tail rhythm', MOD: 'modulator' };
  // cortex.html's Types colours (typeHexes), copied: excitatory types warm, inhibitory cool, in list order
  const TYPE_WARM = ['#ff8a3d', '#ffd23f', '#ff4d6d', '#b5f04a', '#ff7ad9'], TYPE_COOL = ['#33c7ff', '#8b6cff', '#3dffb5', '#4d6bff', '#c9a3ff'];
  const TYPE_WARM_X = ['#ffb36b', '#e8ff6a', '#ff9e9e'], TYPE_COOL_X = ['#7ae8ff', '#5d8cff', '#a8ffd8'];
  const typeHexes = () => { const used = new Set(); return cg.CT.map(t => { const c = (t.exc ? [...TYPE_WARM, ...TYPE_COOL.slice().reverse(), ...TYPE_WARM_X, ...TYPE_COOL_X] : [...TYPE_COOL, ...TYPE_WARM.slice().reverse(), ...TYPE_COOL_X, ...TYPE_WARM_X]).find(x => !used.has(x)); used.add(c); return c; }); };

  // the camera, as cortex.html's camera() builds it (panels hidden, so no shift)
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
  const FOV = 0.85;
  function viewProj() {
    const o = cg.orbit, cp = Math.cos(o.pitch), t = o.target, W = innerWidth, H = innerHeight;
    const eye = [t[0] + o.dist * cp * Math.sin(o.yaw), t[1] + o.dist * Math.sin(o.pitch), t[2] + o.dist * cp * Math.cos(o.yaw)];
    const z = norm(sub(eye, t)), x = norm(cross([0, 1, 0], z)), y = cross(z, x), f = 1 / Math.tan(FOV / 2);
    return { project: p => {
      const q = sub(p, eye), cx = dot(q, x), cy = dot(q, y), cz = -dot(q, z);
      return [W / 2 + (cx / cz) * f * H / 2, H / 2 - (cy / cz) * f * H / 2, cz];
    }, x, y, z };
  }

  let base = null, groups = [], canvas2d = null;
  async function setup(seed = 1) {
    for (let i = 0; i < 300 && !/\d/.test(document.getElementById('stN').textContent); i++) await sleep(100);
    await sleep(300);
    const real = Math.random; Math.random = cg.mulberry32(seed);
    await cg.applyPreset('tadpole');
    Math.random = real;
    document.body.classList.add('ui-hidden'); document.getElementById('dock').style.display = 'none';
    if (!base) base = JSON.parse(JSON.stringify(cg.VIS));
    cg.pause(false);
    const net = cg.net, hex = typeHexes();
    groups = net.circuit.groups.map(g => {
      const c = [0, 0, 0], cells = [], types = {};
      for (let n = 0; n < net.N; n++) if (net.group[n] === g.id) { cells.push(n); for (let a = 0; a < 3; a++) c[a] += net.pos[n][a]; types[net.type[n]] = (types[net.type[n]] || 0) + 1; }
      c.forEach((v, a) => c[a] = v / cells.length);
      let best = cells[0], bd = Infinity;   // anchor on a real cell: the one nearest the centroid (curved groups' centroids can lie outside them)
      for (const n of cells) { const d = Math.hypot(...sub(net.pos[n], c)); if (d < bd) { bd = d; best = n; } }
      const mainType = +Object.entries(types).sort((a, b) => b[1] - a[1])[0][0];
      return { key: g.key, id: g.id, n: cells.length, anchor: net.pos[best], colour: hex[mainType], info: INFO[g.key] || ['', g.name, ''] };
    });
    return groups.map(g => `${g.key}:${g.n}`).join(' ');
  }

  // the two looks: the user's own (Garden), and a diagram look (Types colours, thinner dendrites, brighter somas and tracts)
  const LOOKS = {
    garden: { lens: 'garden', vis: {} },
    diagram: { lens: 'types', vis: { denStain: 0.22, denOpacity: 0.55, somaOpacity: 0.95, somaSize: 2.6, synStain: 0.2, axStain: 0.03, tractOpacity: 0.85, tractWidth: 1.6, apOpacity: 0.3, haze: 0.6 } },
  };
  function look(name) { Object.assign(cg.VIS, JSON.parse(JSON.stringify(base)), LOOKS[name].vis); cg.setLens(LOOKS[name].lens); }

  // camera angles. The head points +z, the Swim side is −x.
  const ANGLES = {
    top:   { yaw: Math.PI / 2, pitch: 1.45, name: 'Top view', sub: 'from above, head to the left' },
    side:  { yaw: Math.PI / 2, pitch: 0.08, name: 'Side view', sub: 'from the Feed side, head to the left' },
    front: { yaw: 0.0, pitch: 0.3, name: 'Head-on view', sub: 'looking at the head, the tail trailing behind' },
    three: { yaw: 0.85, pitch: 0.42, name: 'Three-quarter view', sub: 'from the front, above and to the Feed side' },
  };
  const COL_W = 360, PAD = 28, TOP = 120, BOT = 150;
  function frame(angle) {
    const a = ANGLES[angle], o = cg.orbit, net = cg.net, W = innerWidth, H = innerHeight;
    o.yaw = a.yaw; o.pitch = a.pitch;
    const pts = []; for (let n = 0; n < net.N; n += 5) pts.push(net.pos[n]);
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    o.target = lo.map((v, k) => (v + hi[k]) / 2); o.dist = Math.hypot(...sub(hi, lo)) * 1.2;
    const rx0 = COL_W + PAD * 3, rx1 = W - COL_W - PAD * 3, ry0 = TOP + 20, ry1 = H - BOT - 30;
    for (let it = 0; it < 40; it++) {   // fit the screen box of the cells into the space between the label columns
      const vp = viewProj(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, near = false;
      for (const p of pts) { const s = vp.project(p); if (s[2] < 20) { near = true; break; } x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); }
      if (near) { o.dist *= 1.3; continue; }   // a cell at or behind the camera: back off first
      const k = Math.max((x1 - x0) / (rx1 - rx0), (y1 - y0) / (ry1 - ry0));
      const per = 2 * o.dist * Math.tan(FOV / 2) / H, dx = (x0 + x1) / 2 - (rx0 + rx1) / 2, dy = (y0 + y1) / 2 - (ry0 + ry1) / 2;
      o.target = o.target.map((v, j) => v + 0.6 * (vp.x[j] * dx * per - vp.y[j] * dy * per));
      o.dist *= Math.pow(k, 0.6);
    }
  }

  let held = null;
  async function state(name) {
    if (name === 'touch') cg.kickGroup('touch', 7, 1e7);
    else if (name === 'feed') cg.kickGroup(['eye', 'food'], 7, 1e7);
    held = name;
  }

  function wrap(ctx, text, w) {
    const out = []; let line = '';
    for (const word of text.split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; }
    if (line) out.push(line); return out;
  }
  const STATES = { rest: 'at rest', touch: 'holding Touch (key 1): it swims', feed: 'Light and Food on together: it feeds' };
  function draw(meta) {
    const W = innerWidth, H = innerHeight;
    if (!canvas2d) { canvas2d = document.createElement('canvas'); Object.assign(canvas2d.style, { position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', zIndex: 9999, pointerEvents: 'none' }); document.body.appendChild(canvas2d); }
    canvas2d.width = W; canvas2d.height = H;
    const ctx = canvas2d.getContext('2d'), vp = viewProj(), FONT = '"Segoe UI", system-ui, sans-serif';
    // labels: one per group, in a column on the side its cell lies, spread to keep their own height apart
    // the half of the anchors furthest left take the left column, the rest the right
    const labs = groups.map(g => { const s = vp.project(g.anchor); return { g, ax: s[0], ay: s[1] }; });
    const byX = labs.slice().sort((a, b) => a.ax - b.ax); byX.forEach((l, i) => l.left = i < Math.ceil(labs.length / 2));
    ctx.font = `14px ${FONT}`;
    for (const l of labs) { l.lines = wrap(ctx, l.g.info[2], COL_W - 26); l.h = 26 + l.lines.length * 18 + 12; }
    const layout = col => {
      const tot = col.reduce((s, l) => s + l.h, 0), y0 = 84, y1 = H - 20, gap = Math.max(4, Math.min(16, (y1 - y0 - tot) / Math.max(1, col.length - 1)));
      col.forEach(l => l.y = l.ay - l.h / 2);
      for (let it = 0; it < 4; it++) {
        for (let i = 0; i < col.length; i++) col[i].y = Math.max(col[i].y, i ? col[i - 1].y + col[i - 1].h + gap : y0);
        for (let i = col.length - 1; i >= 0; i--) col[i].y = Math.min(col[i].y, i < col.length - 1 ? col[i + 1].y - col[i].h - gap : y1 - col[i].h);
      }
    };
    // a leader runs from the column edge at the label's row to its cell; swap neighbours whose leaders cross
    const seg = l => { const ex = l.left ? PAD + COL_W + 24 : W - PAD - COL_W - 24; return [ex, l.y + 18, l.ax, l.ay]; };
    const crosses = (a, b) => { const [x1, y1, x2, y2] = seg(a), [x3, y3, x4, y4] = seg(b), d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
      if (!d) return false; const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d; return t > 0 && t < 1 && u > 0 && u < 1; };
    for (const col of [labs.filter(l => l.left), labs.filter(l => !l.left)]) {
      col.sort((a, b) => a.ay - b.ay); layout(col);
      for (let it = 0; it < 40; it++) {
        let swapped = false;
        for (let i = 0; i + 1 < col.length; i++) for (let j = i + 1; j < col.length; j++) if (crosses(col[i], col[j])) {
          [col[i], col[j]] = [col[j], col[i]]; layout(col); swapped = true; break;
        }
        if (!swapped) break;
      }
    }
    for (const l of labs) {
      const [tag, name, job, key] = l.g.info, x = l.left ? PAD : W - PAD - COL_W, tc = TAGS[tag] || '#ccc';
      // leader: from the box edge, a short run out, then straight to the cell
      const ex = l.left ? x + COL_W : x, ey = l.y + 18, mx = l.left ? ex + 24 : ex - 24;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(mx, ey); ctx.lineTo(l.ax, l.ay); ctx.stroke();
      ctx.strokeStyle = tc; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(mx, ey); ctx.lineTo(l.ax, l.ay); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(l.ax, l.ay, 6, 0, 7); ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = tc; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(l.ax, l.ay, 2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      // box
      ctx.fillStyle = 'rgba(8,8,16,0.72)'; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, l.y, COL_W, l.h, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tc; ctx.fillRect(l.left ? x : x + COL_W - 4, l.y + 6, 4, l.h - 12);
      const tx = x + 14; let ty = l.y + 23;
      const dx = meta.look === 'diagram' ? 16 : 0;   // in the diagram look, a dot in the colour of the group's main cell type
      if (dx) { ctx.fillStyle = l.g.colour; ctx.beginPath(); ctx.arc(tx + 5, ty - 6, 5, 0, 7); ctx.fill(); }
      ctx.font = `600 18px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(name, tx + dx, ty);
      let nx = tx + dx + ctx.measureText(name).width + 10;
      ctx.font = `600 11px ${FONT}`; ctx.fillStyle = tc; ctx.fillText(TAG_NAME[tag].toUpperCase(), nx, ty - 1); nx += ctx.measureText(TAG_NAME[tag].toUpperCase()).width + 10;
      if (key) { ctx.font = `600 13px ${FONT}`; const kw = 20; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(x + COL_W - 14 - kw, ty - 16, kw, 20, 4); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(key, x + COL_W - 14 - kw / 2, ty - 1); ctx.textAlign = 'left'; }
      ctx.font = `14px ${FONT}`; ctx.fillStyle = '#c9c9da';
      for (const line of l.lines) { ty += 18; ctx.fillText(line, tx, ty + 4); }
    }
    // title
    const a = ANGLES[meta.angle];
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `600 30px ${FONT}`;
    ctx.fillText(`The Tadpole · ${a.name}`, W / 2, 46);
    ctx.font = `16px ${FONT}`; ctx.fillStyle = '#b8b8cc';
    ctx.fillText(`${a.sub} · ${STATES[meta.state]} · ${meta.look === 'diagram' ? 'diagram look (cells coloured by type)' : 'your Garden look'}`, W / 2, 74);
    // key at the bottom: subsystems, and in the diagram look the cell types
    let rows = [Object.entries(TAG_NAME).map(([t, n]) => [TAGS[t], n, 'bar'])];
    if (meta.look === 'diagram') {
      const hex = typeHexes(), ts = cg.CT.map((t, i) => [hex[i], t.name + (t.exc ? '' : ' (inh.)'), 'dot']);
      rows.push(ts.slice(0, 8), ts.slice(8));
    }
    ctx.font = `14px ${FONT}`;
    rows.forEach((row, ri) => {
      const items = row.map(([c, n, k]) => ({ c, n, k, w: ctx.measureText(n).width + 28 })), tw = items.reduce((s, i) => s + i.w, 0);
      let x = W / 2 - tw / 2; const y = H - BOT + 50 + ri * 26;
      for (const it of items) {
        ctx.fillStyle = it.c;
        if (it.k === 'bar') ctx.fillRect(x, y - 11, 4, 14); else { ctx.beginPath(); ctx.arc(x + 5, y - 4, 5, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#d0d0e0'; ctx.textAlign = 'left'; ctx.fillText(it.n, x + 15, y + 1); x += it.w;
      }
    });
    if (meta.look === 'diagram') { ctx.textAlign = 'center'; ctx.fillStyle = '#9a9ab0'; ctx.font = `13px ${FONT}`; ctx.fillText('Warm colours excite, cool colours inhibit. Brightness follows activity.', W / 2, H - BOT + 50 + 3 * 26); }
    ctx.textAlign = 'left';
  }
  function clear() { if (canvas2d) canvas2d.getContext('2d').clearRect(0, 0, canvas2d.width, canvas2d.height); }
  const err = () => { const e = document.getElementById('err'); return e && !e.hidden ? e.textContent : null; };
  return { setup, look, frame, state, draw, clear, err, groups: () => groups, ANGLES, LOOKS };
})();
'guide ready'
