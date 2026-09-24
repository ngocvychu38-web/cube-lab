// Documentation fixture generation only: no network requests or API keys.
const fs = require('node:fs');
const path = require('node:path');
const Cube = require('../cross-planner.js');
const Corner = require('../corner-planner.js');
const Layers = require('../layer-planners.js');
const dir = path.join(__dirname, 'jev-examples');
const solved = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
  const position = [x, y, z];
  const stickers = Object.entries(Cube.NORMALS)
    .filter(([, normal]) => normal.reduce((sum, v, i) => sum + v * position[i], 0) === 1)
    .map(([homeFace, normal]) => ({ homeFace, color: Cube.COLORS[homeFace], normal: [...normal] }));
  if (stickers.length) solved.push({ position, stickers });
}
const inverse = moves => [...moves].reverse().map(m => m.endsWith('2') ? m : m.endsWith("'") ? m[0] : m + "'");
const cases = [
  ['01-cross', Cube, ['F']],
  ['02-corners', Corner, inverse(['R', 'U', "R'"])],
  ['03-top-edges', Layers.topEdges, inverse("R U' R U R U R U' R' U' R2".split(' '))]
];
async function main() {
  fs.mkdirSync(dir, { recursive: true });
  const summaries = [];
  for (const [name, planner, setup] of cases) {
    const state = setup.reduce((s, m) => Cube.move(s, m), solved);
    const plans = await planner.plan(state);
    const payload = planner.request(state, plans, { model: 'jev-latest', revision: setup.length, recent: [] });
    const response = { model: 'jev-latest', answers: { plan: { type: 'choice', choice: plans[0].id, confidence: 0.9 } } };
    for (const [suffix, value] of [['request', payload], ['context', JSON.parse(payload.state)], ['response.example', response]]) {
      fs.writeFileSync(path.join(dir, `${name}.${suffix}.json`), JSON.stringify(value, null, 2) + '\n');
    }
    summaries.push({ name, setup, stage: JSON.parse(payload.state).stage, beforeCount: planner.status(state).count,
      selected: plans[0].id, moves: plans[0].moves, afterCount: plans[0].afterCount, candidateCount: plans.length });
  }
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summaries, null, 2) + '\n');
  console.log(JSON.stringify(summaries, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
