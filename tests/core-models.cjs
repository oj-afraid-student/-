const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('../src/core.js');
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const p={m:1,M:3,L:4,v0:4,mu:.2,g:10};
const sum=C.board(p);
for(const [k,v] of Object.entries({f:2,aBlock:-2,aBoard:2/3,syncTime:1.5,slideDistance:3,commonV:1,xBlockEvent:3.75,xBoardEvent:.75,energyLoss:6}))near(sum[k],v);
assert.equal(sum.stays,true);
const sync=C.boardState(p,1.5),after=C.boardState(p,3.5);
near(sync.vBlock,1);near(sync.vBoard,1);near(sync.friction,0);near(sync.accelerationBlock,0);near(after.xBlock,5.75);near(after.xBoard,2.75);near(after.relative,3);
for(const key of ['xBlock','xBoard','vBlock','vBoard'])near(C.boardState(p,1.5-1e-9)[key],sync[key]);
const short={...p,L:2},exit=C.board(short),end=C.boardState(short,exit.horizon);
near(exit.eventTime,(3-Math.sqrt(3))/2);assert.equal(exit.stays,false);near(end.relative,2);near(end.vBlock,1+Math.sqrt(3));assert.equal(end.terminal,true);assert.equal(end.accelerationBlock,null);
assert.deepEqual(C.boardState(short,100),end);
assert.equal(C.board({...p,L:3}).critical,true);
assert.equal(C.board({...p,L:2.999}).stays,false);
for(const mu of [0,.05,.2,.5])for(const M of [1,3,8])for(const L of [.5,3,6]) {
  const q={...p,mu,M,L},s=C.board(q);assert.ok(!s.error);
  for(let i=0;i<=20;i++){
    const st=C.boardState(q,s.horizon*i/20);near(q.m*st.vBlock+q.M*st.vBoard,q.m*q.v0);
    assert.ok(st.relative>=-1e-9&&st.relative<=L+1e-8);
    const E=.5*q.m*st.vBlock**2+.5*q.M*st.vBoard**2;
    near(.5*q.m*q.v0**2-E,s.f*st.relative);
  }
}
for(const q of [{...p,M:0},{...p,m:NaN},{...p,L:-1},{...p,mu:-.1},{...p,v0:0}])assert.ok(C.board(q).error);
const text='木板质量 M=3 kg，板长 L=4 m，木块质量 m=1 kg，初速度 v₀=4 m/s，μ=0.20，g=10 m/s²';
assert.deepEqual(C.parseConditions(text,'physics'),p);
assert.equal(C.parseConditions('M=4 kg','physics').m,null);
assert.equal(C.parseConditions('m=1 kg','physics').M,null);
const g={side:5,base:6,height:4,ratio:.5},geo=C.prism(g);
near(geo.altitude,4);near(geo.AM,4);near(geo.diagonal,Math.sqrt(32));near(geo.pairs.diagonals.angle,90);assert.equal(geo.perpendicular,true);assert.equal(geo.square,true);
near(geo.pairs.parallel.angle,0);near(geo.pairs.skew.angle,90);near(geo.pairs.base.angle,90);
const high=C.prism({...g,height:6});assert.equal(high.perpendicular,false);near(high.pairs.diagonals.angle,Math.acos(20/52)*180/Math.PI);
assert.equal(C.prism({...g,ratio:.8}).perpendicular,false);
for(const ratio of [.1,.25,.5,.8,.9])for(const height of [1,4,6]) {
  const a=C.prism({...g,ratio,height}),v=a.vertices;
  near(v.M[0],-3+6*ratio);near(v.N[0],v.M[0]);near(v.N[2],height);near(a.pairs.parallel.angle,0);near(a.pairs.skew.angle,90);
  for(let i=0;i<3;i++){near((v.A[i]+v.N[i])/2,v.O[i]);near((v.A1[i]+v.M[i])/2,v.O[i]);}
}
assert.ok(C.prism({...g,side:2}).error);assert.ok(C.prism({...g,ratio:0}).error);
assert.deepEqual(C.parseConditions('直三棱柱，AB=AC=5，BC=6，侧棱长为 4，M、N 是中点','geometry'),g);
const d=JSON.parse(fs.readFileSync(__dirname+'/../data/demo-data.json','utf8'));
const metrics=C.mastery(d,d.attempts.filter(a=>a.assignment_id!=='A-PERSONAL'));
assert.equal(metrics.K02.pct,20);assert.equal(metrics.K03.pct,80);assert.equal(metrics.G01.n,0);
const report={passed:true,date:'2026-10-29',checks:['board analytical values','continuous sync boundary','short-board endpoint','critical length','36 parameter combinations with momentum and energy conservation at 21 times each','case-sensitive mass parsing','3D midpoint and diagonal proof','15 geometry parameter combinations','unchanged learning baseline']};
fs.writeFileSync(__dirname+'/../validation/core-model-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
