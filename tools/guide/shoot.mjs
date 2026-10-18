// The Tadpole user's guide renders: every look × input state × camera angle, labelled by tools/guide/overlay.js.
// usage: node tools/guide/shoot.mjs <outDir> [looks] [states] [angles]   (comma lists; default all)
// Needs headless Edge with WebGPU on CDP_PORT (default 9333), as in CLAUDE.md. VW/VH set the image size (default 3440×1440, the user's display).
// NOLABEL=1 leaves the labels off.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir = 'docs/guide', looksA, statesA, anglesA] = process.argv.slice(2);
const looks = (looksA || 'diagram,garden').split(','), states = (statesA || 'rest,touch,feed').split(','), angles = (anglesA || 'top,side,front,three').split(',');
const PORT = process.env.CDP_PORT || 9333, VW = +(process.env.VW || 3440), VH = +(process.env.VH || 1440);
const url = 'file:///' + path.resolve(here, '../../cortex.html').replace(/\\/g, '/').replace(/ /g, '%20') + '#debug';
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION:', JSON.stringify(m.params.exceptionDetails).slice(0, 600));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async js => { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800)); return r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(1500);
await run(`window.GUIDE_INFO = ${fs.readFileSync(path.join(here, 'groups.json'), 'utf8')}`);
console.log(await run(fs.readFileSync(path.join(here, 'overlay.js'), 'utf8')));

for (const st of states) {
  // each state starts from the same freshly grown specimen, settled for a few seconds, then holds its input
  console.log(st, 'groups', await run('GUIDE.setup(1)'));
  await sleep(3000);
  await run(`GUIDE.state('${st}')`);
  await sleep(st === 'rest' ? 0 : 1800);
  for (const lk of looks) for (const an of angles) {
    await run(`GUIDE.clear(); GUIDE.look('${lk}'); GUIDE.frame('${an}')`);
    await sleep(450);
    if (!process.env.NOLABEL) await run(`GUIDE.draw({ look: '${lk}', state: '${st}', angle: '${an}' })`);   // NOLABEL=1: the bare render
    await sleep(120);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(outDir, `tadpole-${lk}-${st}-${an}.png`);
    fs.writeFileSync(f, Buffer.from(shot.result.data, 'base64'));
    console.log('saved', f);
  }
}
const e = await run('GUIDE.err()'); if (e) console.log('GPU ERRORS:', e);
await fetch(`http://127.0.0.1:${PORT}/json/close/${tgt.id}`); ws.close(); process.exit(0);
