import fs from 'fs';
const p = 'public/js/flow/games-flow.js';
let lines = fs.readFileSync(p, 'utf8').split('\n');
const out = [];
let inserted = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/await afterJudge\(/.test(line)) {
    const prev = out[out.length - 1] || '';
    const recent = out.slice(-6).join('\n');
    const need = !/await waitBtn\(/.test(prev)
      && (/await say\(/.test(recent) || /pushCampLog\(/.test(recent));
    if (need) {
      out.push("  await waitBtn('继续');");
      inserted += 1;
    }
  }
  out.push(line);
}
fs.writeFileSync(p, out.join('\n'), 'utf8');
console.log('inserted', inserted);
const s = out.join('\n');
const aj = [...s.matchAll(/await afterJudge\(/g)].length;
const wb = [...s.matchAll(/await waitBtn\(/g)].length;
console.log({ afterJudge: aj, waitBtn: wb });
