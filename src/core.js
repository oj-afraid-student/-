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
  function board(p) {
    if (!['m', 'M', 'L', 'v0', 'mu', 'g'].every(k => Number.isFinite(p[k]))) return {error: '请补齐木块、木板、板长、初速度、摩擦因数和 g。'};
    if (p.m <= 0 || p.M <= 0 || p.L <= 0 || p.v0 <= 0 || p.g <= 0 || p.mu < 0) return {error: '质量、板长、初速度和 g 应大于 0；动摩擦因数不能为负。'};
    const f = p.mu * p.m * p.g, aBlock = -p.mu * p.g, aBoard = f / p.M;
    const relativeAcceleration = p.mu * p.g * (1 + p.m / p.M);
    const syncTime = relativeAcceleration ? p.v0 / relativeAcceleration : Infinity;
    const slideDistance = relativeAcceleration ? p.v0 ** 2 / (2 * relativeAcceleration) : Infinity;
    const tolerance = 1e-9 * Math.max(1, p.L, Number.isFinite(slideDistance) ? slideDistance : 1);
    const stays = slideDistance <= p.L + tolerance;
    const critical = stays && Math.abs(slideDistance - p.L) <= tolerance;
    const eventTime = stays ? syncTime : 2 * p.L / (p.v0 + Math.sqrt(Math.max(0, p.v0 ** 2 - 2 * relativeAcceleration * p.L)));
    const eventVBlock = p.v0 + aBlock * eventTime, eventVBoard = aBoard * eventTime;
    const xBlockEvent = p.v0 * eventTime + aBlock * eventTime ** 2 / 2, xBoardEvent = aBoard * eventTime ** 2 / 2;
    const commonV = p.m * p.v0 / (p.m + p.M);
    return {f, aBlock, aBoard, relativeAcceleration, syncTime, slideDistance, stays, critical, eventTime, eventVBlock, eventVBoard, xBlockEvent, xBoardEvent, commonV,
      relativeAtEvent: stays ? Math.min(p.L, slideDistance) : p.L,
      energyLoss: f * (stays ? Math.min(p.L, slideDistance) : p.L),
      horizon: stays ? eventTime + Math.max(2, eventTime) : eventTime};
  }
  function boardState(p, time) {
    const s = board(p); if (s.error) return s;
    if (!Number.isFinite(time)) return {error: '模拟时间必须是有限数值。'};
    const t = Math.max(0, Math.min(time, s.horizon));
    if (t < s.eventTime) {
      const xBlock = p.v0 * t + s.aBlock * t * t / 2, xBoard = s.aBoard * t * t / 2;
      return {...s, t, xBlock, xBoard, vBlock: p.v0 + s.aBlock * t, vBoard: s.aBoard * t, accelerationBlock: s.aBlock, accelerationBoard: s.aBoard, relative: xBlock - xBoard, friction: s.f, phase: '相对滑动', terminal: false};
    }
    if (!s.stays) return {...s, t: s.eventTime, xBlock: s.xBlockEvent, xBoard: s.xBoardEvent, vBlock: s.eventVBlock, vBoard: s.eventVBoard, accelerationBlock: null, accelerationBoard: null, relative: p.L, friction: null, phase: '到达右端 · 演示结束', terminal: true};
    const dt = t - s.eventTime;
    return {...s, t, xBlock: s.xBlockEvent + s.commonV * dt, xBoard: s.xBoardEvent + s.commonV * dt, vBlock: s.commonV, vBoard: s.commonV, accelerationBlock: 0, accelerationBoard: 0, relative: s.relativeAtEvent, friction: 0, phase: s.critical ? '临界共速 · 恰在右端' : '共速后匀速运动', terminal: false};
  }
  function prism(g) {
    if (!['side', 'base', 'height', 'ratio'].every(k => Number.isFinite(g[k]))) return {error: '请补齐三棱柱的边长、侧棱长和点的位置比例。'};
    if (g.side <= 0 || g.base <= 0 || g.height <= 0 || 2 * g.side <= g.base || g.ratio <= 0 || g.ratio >= 1) return {error: '底面须为非退化等腰三角形，侧棱长大于 0，位置比例应在 0 与 1 之间。'};
    const altitude = Math.sqrt(g.side ** 2 - g.base ** 2 / 4), x = g.base * (g.ratio - .5);
    const vertices = {A:[0,altitude,0], B:[-g.base/2,0,0], C:[g.base/2,0,0], A1:[0,altitude,g.height], B1:[-g.base/2,0,g.height], C1:[g.base/2,0,g.height], M:[x,0,0], N:[x,0,g.height], O:[x/2,altitude/2,g.height/2]};
    const vector = (a,b) => vertices[b].map((v,i)=>v-vertices[a][i]);
    const angleBetween = (a,b,c,d) => {const u=vector(a,b),v=vector(c,d),dot=u.reduce((s,n,i)=>s+n*v[i],0),norm=Math.hypot(...u)*Math.hypot(...v);return {angle:Math.acos(Math.min(1,Math.max(0,Math.abs(dot)/norm)))*180/Math.PI,dot};};
    const pairs = {diagonals:{lines:[['A','N'],['A1','M']],relation:'相交',...angleBetween('A','N','A1','M')}, parallel:{lines:[['A','A1'],['M','N']],relation:'平行',...angleBetween('A','A1','M','N')}, skew:{lines:[['A','B'],['M','N']],relation:'异面',...angleBetween('A','B','M','N')}, base:{lines:[['A','M'],['B','C']],relation:'相交',...angleBetween('A','M','B','C')}};
    const AM = Math.hypot(x,altitude), diagonal = Math.hypot(AM,g.height);
    return {vertices, altitude, AM, diagonal, pairs, perpendicular:Math.abs(pairs.diagonals.dot)<1e-8*Math.max(1,diagonal**2), square:Math.abs(AM-g.height)<1e-8*Math.max(1,AM,g.height)};
  }
  function parseConditions(text, kind) {
    const read = (...patterns) => {for (const re of patterns) {const m = text.match(re); if (m) return Number(m[1]);} return null;};
    if (kind === 'geometry') return {
      side: read(/AB\s*[=＝]\s*AC\s*[=＝]\s*(\d+(?:\.\d+)?)/i, /腰长(?:为|是)?\s*(\d+(?:\.\d+)?)/),
      base: read(/BC\s*[=＝]\s*(\d+(?:\.\d+)?)/i, /底边长(?:为|是)?\s*(\d+(?:\.\d+)?)/),
      height: read(/侧棱长(?:为|是)?\s*(\d+(?:\.\d+)?)/, /AA[₁1]\s*[=＝]\s*(\d+(?:\.\d+)?)/i),
      ratio: /中点/.test(text) ? .5 : read(/r\s*[=＝]\s*(\d*\.?\d+)/),
    };
    return {
      m: read(/木块(?:的)?质量(?:为|是)?\s*(\d+(?:\.\d+)?)/, /\bm\s*[=＝]\s*(\d+(?:\.\d+)?)/),
      M: read(/木板(?:的)?质量(?:为|是)?\s*(\d+(?:\.\d+)?)/, /\bM\s*[=＝]\s*(\d+(?:\.\d+)?)/),
      L: read(/(?:木板长|板长|长度)(?:为|是)?\s*(\d+(?:\.\d+)?)\s*m/, /\bL\s*[=＝]\s*(\d+(?:\.\d+)?)/),
      mu: read(/(?:动摩擦因[数素]|摩擦因数)(?:为|是)?\s*(\d*\.?\d+)/, /[μµ]\s*[=＝]\s*(\d*\.?\d+)/, /mu\s*[=＝]\s*(\d*\.?\d+)/i),
      g: read(/g\s*[=＝]\s*(\d+(?:\.\d+)?)/i),
      v0: read(/(?:初速度|此时速度)(?:为|是)?\s*(\d+(?:\.\d+)?)/, /v[₀0]\s*[=＝]\s*(\d+(?:\.\d+)?)/),
    };
  }
  const api = {clone, round, physics, physicsState, board, boardState, prism, grade, mastery, classStats, pickQuestions, parseConditions};
  root.ZCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
