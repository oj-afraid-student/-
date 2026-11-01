(function(root){'use strict';const clone=v=>JSON.parse(JSON.stringify(v));const round=(v,n=1)=>Math.round((v+Number.EPSILON)*10**n)/10**n;
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

root.ZCore={clone,round,board,boardState};})(globalThis);
