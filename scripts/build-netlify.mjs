import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ['index.html', 'cross-planner.js', 'corner-planner.js', 'layer-planners.js', 'cross-controller.js']) {
  await cp(new URL(file, root), new URL(file, output));
}
const audioOutput = new URL('assets/audio/', output);
await mkdir(audioOutput, { recursive: true });
for (const file of ['rubik-turn-90.wav', 'rubik-turn-180.wav']) {
  await cp(new URL(`assets/audio/${file}`, root), new URL(file, audioOutput));
}
console.log('Netlify static site assembled in dist/');
