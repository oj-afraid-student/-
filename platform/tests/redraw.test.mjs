import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { redrawDiagram } = await import('../src/server/ai/redraw.ts');
const { candidateDiagramSchema } = await import('../src/shared/candidate-diagram.ts');
const diagram = {
  points: [
    { id: 'A', x: 100, y: 300 },
    { id: 'B', x: 500, y: 300 },
    { id: 'P', x: 300, y: 50 },
  ],
  edges: [
    { from: 'P', to: 'A', dashed: false },
    { from: 'P', to: 'B', dashed: true },
  ],
  labels: [{ text: '2', x: 250, y: 330 }],
};
test('redraw validates photo and endpoints, retries original input, and supports uncertainty without an invented figure', async () => {
  const oldFetch = globalThis.fetch;
  const env = ['ZHIXU_AI_API_KEY', 'ZHIXU_AI_BASE_URL', 'ZHIXU_AI_MODEL'];
  const saved = env.map((key) => process.env[key]);
  Object.assign(process.env, {
    ZHIXU_AI_API_KEY: 'test-only',
    ZHIXU_AI_BASE_URL: 'https://example.test',
    ZHIXU_AI_MODEL: 'test',
  });
  const calls = [];
  const input = { text: '第16题原题干', photo: 'data:image/jpeg;base64,/9j/AA==' };
  try {
    globalThis.fetch = async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return Response.json({
        choices: [
          {
            finish_reason: calls.length === 1 ? 'length' : 'stop',
            message: {
              content: calls.length === 1 ? '{' : JSON.stringify({ diagram, uncertainties: [] }),
            },
          },
        ],
      });
    };
    assert.deepEqual(await redrawDiagram(input), { diagram, uncertainties: [] });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].messages[1], calls[1].messages[1]);
    assert.match(calls[1].messages[0].content, /按同一原题和照片/);
    await assert.rejects(
      redrawDiagram({ ...input, photo: 'https://invalid.test/image' }),
      /有效原题照片/,
    );
    assert.equal(calls.length, 2);
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                diagram: {
                  ...diagram,
                  edges: [{ from: 'A', to: 'UNKNOWN', dashed: false }, diagram.edges[1]],
                },
                uncertainties: [],
              }),
            },
          },
        ],
      });
    await assert.rejects(redrawDiagram(input), /连线无效/);
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: '{"diagram":null,"uncertainties":["曲线图暂不支持点线转绘"]}' },
          },
        ],
      });
    assert.equal((await redrawDiagram(input)).diagram, null);
    assert.equal(
      candidateDiagramSchema.safeParse({ ...diagram, labels: [{ text: '2', x: 999, y: 50 }] })
        .success,
      false,
    );
  } finally {
    globalThis.fetch = oldFetch;
    env.forEach((key, index) =>
      saved[index] === undefined ? delete process.env[key] : (process.env[key] = saved[index]),
    );
  }
});
