// usage: node cdp.mjs <url> <seconds> <out.png> [jsToEvalBeforeShot]
const [url, secs, out, evalJs] = process.argv.slice(2);
const PORT = process.env.CDP_PORT || 9333;   // set CDP_PORT to drive a second headless browser
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ver;
for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(200); } }
const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled') console.log('console.' + m.params.type + ':', m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 400));
  else if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION:', JSON.stringify(m.params.exceptionDetails).slice(0, 600));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +(process.env.VW || 1440), height: +(process.env.VH || 900), deviceScaleFactor: +(process.env.DSF || 1), mobile: false });
await send('Page.navigate', { url });
await sleep(1500); if (process.env.PRE) { await send("Runtime.evaluate", { expression: process.env.PRE, userGesture: true }); } await sleep(+secs * 1000);
if (evalJs) { const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, userGesture: true }); console.log('eval:', JSON.stringify(r.result?.result?.value ?? r.result).slice(0, 20000)); await sleep(1500); }
const shot = await send('Page.captureScreenshot', { format: 'png' });
(await import('fs')).writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
await fetch(`http://127.0.0.1:${PORT}/json/close/${tgt.id}`); ws.close(); process.exit(0);
