// Compare a T0 run against tools/tests/baseline.json.
// usage: node tools/tests/compare.mjs <cdp output file>   (the file holds the "eval: ..." line printed by tools/cdp.mjs)
// Exits 1 if any hash differs.
import { readFileSync } from 'fs';
const line = readFileSync(process.argv[2], 'utf8').split('\n').find(l => l.startsWith('eval:'));
const run = JSON.parse(JSON.parse(line.slice(5)));
const base = JSON.parse(readFileSync(new URL('./baseline.json', import.meta.url), 'utf8'));
// circuit presets (Phase 1 final commit), checked when the run includes them
const circ = JSON.parse(readFileSync(new URL('./baseline-circuits.json', import.meta.url), 'utf8'));
for (const b of circ.results) if (run.results.some(x => x.key === b.key)) base.results.push(b);
let bad = 0;
for (const b of base.results) {
  const r = run.results.find(x => x.key === b.key && x.seed === b.seed);
  if (!r) { console.log(`MISSING ${b.key}/${b.seed}`); bad++; continue; }
  const diff = Object.keys(b.hash).filter(k => b.hash[k] !== r.hash[k]);
  if (diff.length) bad++;
  console.log(`${diff.length ? 'DIFF ' : 'same '} ${b.key}/${b.seed}${diff.length ? '  ' + diff.join(',') : ''}`);
}
if (run.profile) console.log(run.profile.join('\n---\n'));
console.log(run.err ? `#err: ${run.err}` : '#err hidden');
console.log(bad ? `T0 FAIL (${bad})` : 'T0 PASS');
process.exit(bad ? 1 : 0);
