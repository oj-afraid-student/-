(function (root) {
  'use strict';
  const clone = v => JSON.parse(JSON.stringify(v));
  const round = (v, n = 1) => Math.round((v + Number.EPSILON) * 10 ** n) / 10 ** n;
  function physics(p) {
    if (!['m', 'mu', 'g', 'F', 'v0', 'tau'].every(k => Number.isFinite(p[k]))) return {error: '请补齐全部物理参数。'};
    if (p.m <= 0 || p.mu <= 0 || p.g <= 0 || p.v0 <= 0 || p.tau <= 0 || p.F < 0) return {error: '质量、摩擦因数、初速度、g 和作用时长应大于 0，拉力应非负。'};
    const f = p.mu * p.m * p.g;
    if (p.F < f - 1e-9) return {error: '该参数可能在牵引阶段提前停止。此示例先支持 F ≥ μmg；请增大拉力或减小摩擦因数。'};
    const a1 = (p.F - f) / p.m, a2 = -p.mu * p.g;
    const vt = p.v0 + a1 * p.tau, xt = p.v0 * p.tau + a1 * p.tau ** 2 / 2;
    const brakeTime = -vt / a2, brakeDistance = vt ** 2 / (-2 * a2);
    return {f, a1, a2, vt, xt, brakeTime, brakeDistance, stop: p.tau + brakeTime, distance: xt + brakeDistance};
  }
  function physicsState(p, t) {
    const s = physics(p);
    if (s.error) return s;
    t = Math.max(0, t);
    if (t < p.tau) return {...s, t, x: p.v0 * t + s.a1 * t * t / 2, v: p.v0 + s.a1 * t, a: s.a1, pull: p.F, friction: s.f, phase: '牵引加速'};
    if (t < s.stop) {
      const u = t - p.tau;
      return {...s, t, x: s.xt + s.vt * u + s.a2 * u * u / 2, v: Math.max(0, s.vt + s.a2 * u), a: s.a2, pull: 0, friction: s.f, phase: '撤力减速'};
    }
    return {...s, t, x: s.distance, v: 0, a: 0, pull: 0, friction: 0, phase: '已经停止'};
  }
  function grade(q, answer) {
    if (answer === '' || answer === null || answer === undefined) return false;
    if (q.type === 'numeric') return Number.isFinite(Number(answer)) && Math.abs(Number(answer) - q.answer) <= (q.absolute_tolerance || .01) + 1e-10;
    return answer === q.answer;
  }
  function mastery(data, attempts, student = 'S01', asOf = '2026-10-22T23:59:59+08:00') {
    const end = new Date(asOf).getTime(), start = end - data.mastery_rule.window_days * 86400000;
    const qmap = Object.fromEntries(data.questions.map(q => [q.id, q]));
    return Object.fromEntries(data.knowledge_points.map(k => {
      const seen = new Set();
      const records = attempts.filter(a => a.student_id === student && a.counts_as_independent_first && qmap[a.question_id] && new Date(a.submitted_at).getTime() >= start && new Date(a.submitted_at).getTime() <= end)
        .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at) || b.id.localeCompare(a.id))
        .filter(a => {const key = `${a.question_id}:${a.question_version}`; if (seen.has(key)) return false; seen.add(key); return qmap[a.question_id].primary_knowledge_id === k.id;})
        .slice(0, data.mastery_rule.max_distinct_question_versions);
      const n = records.length, correct = records.filter(a => a.is_correct).length, pct = n ? correct / n * 100 : null;
      return [k.id, {correct, n, pct: pct === null ? null : round(pct), records, status: n < data.mastery_rule.minimum_evidence ? '证据不足' : pct < 60 ? '优先复习' : pct < 80 ? '继续巩固' : '近期表现较稳定'}];
    }));
  }
  function classStats(data, attempts, assignment) {
    const ids = new Set(assignment.question_ids);
    const members = data.class.student_ids;
    const rows = members.map(id => {
      const records = attempts.filter(a => a.student_id === id && a.assignment_id === assignment.id && a.event_type === 'first_submission' && ids.has(a.question_id));
      return {id, records, submitted: records.length > 0, correct: records.filter(a => a.is_correct).length};
    });
    const submitted = rows.filter(r => r.submitted), records = submitted.flatMap(r => r.records);
    const valid = records.filter(r => r.counts_as_independent_first);
    const perQuestion = assignment.question_ids.map(qid => {
      const rs = valid.filter(a => a.question_id === qid);
      return {qid, correct: rs.filter(a => a.is_correct).length, n: rs.length};
    });
    const qmap=Object.fromEntries(data.questions.map(q=>[q.id,q]));
    const grouped={};
    perQuestion.forEach(r=>{const k=qmap[r.qid]?.primary_knowledge_id;if(!k)return;grouped[k]||={kid:k,correct:0,n:0,questionCount:0};grouped[k].correct+=r.correct;grouped[k].n+=r.n;grouped[k].questionCount++;});
    return {rows, submitted: submitted.length, expected: members.length, mean: submitted.length ? submitted.reduce((n, r) => n + r.correct, 0) / submitted.length : null, perQuestion, perKnowledge:Object.values(grouped)};
  }
  function pickQuestions(data, selected, count, difficulty = 'mixed', excluded = []) {
    const pool = data.questions.filter(q => q.id.startsWith('T') && !excluded.includes(q.id) && selected.includes(q.primary_knowledge_id) && (difficulty === 'mixed' || q.difficulty === difficulty));
    return pool.slice(0, count).map(q => q.id);
  }
  function parseConditions(text, kind) {
    const read = (...patterns) => {for (const re of patterns) {const m = text.match(re); if (m) return Number(m[1]);} return null;};
    if (kind === 'geometry') return {edge: read(/棱长(?:为|是)?\s*(\d+(?:\.\d+)?)/, /(?:a|L)\s*[=＝]\s*(\d+(?:\.\d+)?)/)};
    return {
      m: read(/质量(?:为|是)?\s*(\d+(?:\.\d+)?)\s*(?:kg|千克)/i, /\bm\s*[=＝]\s*(\d+(?:\.\d+)?)/i),
      mu: read(/(?:动摩擦因[数素]|摩擦因数)(?:为|是)?\s*(\d*\.?\d+)/, /[μµ]\s*[=＝]\s*(\d*\.?\d+)/, /mu\s*[=＝]\s*(\d*\.?\d+)/i),
      g: read(/g\s*[=＝]\s*(\d+(?:\.\d+)?)/i),
      F: read(/F\s*[=＝]\s*(\d+(?:\.\d+)?)/, /拉力(?:为|是)?\s*(\d+(?:\.\d+)?)\s*N/i),
      v0: read(/(?:初速度|此时速度)(?:为|是)?\s*(\d+(?:\.\d+)?)/, /v[₀0]\s*[=＝]\s*(\d+(?:\.\d+)?)/),
      tau: read(/前\s*(\d+(?:\.\d+)?)\s*s\s*内/i, /t\s*[=＝]\s*(\d+(?:\.\d+)?)\s*s\s*时撤去/i, /[τ]\s*[=＝]\s*(\d+(?:\.\d+)?)/),
    };
  }
  const api = {clone, round, physics, physicsState, grade, mastery, classStats, pickQuestions, parseConditions};
  root.ZCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
