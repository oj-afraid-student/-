(function(root){'use strict';
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

root.ZGeometry={prism};if(typeof module!=='undefined'&&module.exports)module.exports={prism};})(typeof globalThis!=='undefined'?globalThis:this);
