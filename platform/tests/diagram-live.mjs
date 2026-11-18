import './helpers/server-loader.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { modelJson } = await import('../src/server/ai/model.ts');
const { problemSchema } = await import('../src/shared/study-contract.ts');
const source = fs.readFileSync('src/app/api/v1/ai/study/route.ts', 'utf8');
const prompt = [...source.matchAll(/'([^'\n]*你是数学与物理题目转录助手[^'\n]*)'/g)][0][1];
const photo =
  'data:image/jpeg;base64,' +
  fs.readFileSync(process.env.ZHIXU_TEST_IMAGE || '/tmp/geometry-diagram.jpg').toString('base64');
const output = problemSchema.parse(
  await modelJson(
    prompt,
    [
      { type: 'text', text: '请识别图示点名及E、F所在边。求折叠后C到A′D′的距离。' },
      { type: 'image_url', image_url: { url: photo } },
    ],
    3500,
  ),
);
assert.ok(output.diagram?.length);
fs.writeFileSync('.local/diagram-live.json', JSON.stringify(output, null, 2));
console.log(
  JSON.stringify({
    conditions: output.conditions,
    diagram: output.diagram,
    uncertainties: output.uncertainties,
  }),
);
