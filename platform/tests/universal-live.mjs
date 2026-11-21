import './helpers/server-loader.mjs';
import fs from 'node:fs';
import { problem } from './universal-fixture.mjs';
const { generateUniversal } = await import('../src/server/ai/universal-generator.ts');
const photo = process.env.ZHIXU_TEST_IMAGE
  ? 'data:image/jpeg;base64,' + fs.readFileSync(process.env.ZHIXU_TEST_IMAGE).toString('base64')
  : undefined;
const result = await generateUniversal(problem, photo);
fs.mkdirSync('.local', { recursive: true });
fs.writeFileSync('.local/universal-live.json', JSON.stringify({ problem, result }));
console.log(
  JSON.stringify({
    nodes: result.plan.nodes.length,
    parameters: result.plan.parameters.length,
    samples: result.samples,
    warnings: result.warnings,
  }),
);
