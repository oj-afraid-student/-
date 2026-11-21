import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { studyInputSchema, problemSchema, guidanceSchema } from '../src/shared/study-contract.ts';
const problem = {
  title: '测试',
  text: '已知 x+2=5，求 x',
  conditions: ['x+2=5'],
  questions: ['求 x'],
  uncertainties: [],
};
test('study rejects empty input, non-image payload and oversized photos', () => {
  for (const input of [
    { action: 'recognize', text: '' },
    { action: 'recognize', text: '题目', photo: 'javascript:alert(1)' },
    { action: 'recognize', text: '题目', photo: 'a'.repeat(950001) },
  ])
    assert.equal(studyInputSchema.safeParse(input).success, false);
  assert.equal(
    studyInputSchema.safeParse({ action: 'recognize', text: problem.text }).success,
    true,
  );
});
test('study refuses nonexistent subquestion and executable model fields', () => {
  assert.equal(
    studyInputSchema.safeParse({ action: 'hint', problem, question: 1, progress: '', followup: '' })
      .success,
    false,
  );
  assert.equal(problemSchema.safeParse({ ...problem, script: 'alert(1)' }).success, false);
  assert.equal(guidanceSchema.safeParse({ hint: '', check: '', limitations: [] }).success, false);
  assert.equal(
    studyInputSchema.safeParse({
      action: 'hint',
      problem,
      question: 0,
      progress: '减去2',
      followup: '',
    }).success,
    true,
  );
});
