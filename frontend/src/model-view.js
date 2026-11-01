(function(root){'use strict';const C=ZGeometry;const fmt=(n)=>Number.isFinite(n)?String(Math.round(n*100)/100):'—';const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const geoNames={A:'A',B:'B',C:'C',A1:'A₁',B1:'B₁',C1:'C₁',M:'M',N:'N',O:'O'};
  const pairNames={diagonals:'AN 与 A₁M',parallel:'AA₁ 与 MN',skew:'AB 与 MN',base:'AM 与 BC'};
  function prismSVG(g,mini=false) {
    const model=C.prism(g);if(model.error)return `<div class="empty">${esc(model.error)}</div>`;
    const {vertices:v}=model,scale=(mini?175:255)*g.zoom/Math.max(g.base,model.altitude,g.height),cx=300,cy=mini?155:219;
    const pt=([x,y,z])=>{y-=model.altitude/2;z-=g.height/2;const u=x*Math.cos(g.yaw)-y*Math.sin(g.yaw),h=x*Math.sin(g.yaw)+y*Math.cos(g.yaw);return [cx+u*scale,cy+(h*Math.sin(g.pitch)-z*Math.cos(g.pitch))*scale,h*Math.cos(g.pitch)+z*Math.sin(g.pitch)];};
    const p=Object.fromEntries(Object.entries(v).map(([k,a])=>[k,pt(a)]));
    const line=(a,b,attrs)=>`<path d="M${p[a][0]} ${p[a][1]}L${p[b][0]} ${p[b][1]}" fill="none" ${attrs}/>`;
    const faces=[['A','C','B'],['A1','B1','C1'],['A','B','B1','A1'],['B','C','C1','B1'],['C','A','A1','C1']];
    const visible=faces.map(f=>{const [a,b,c]=f.map(k=>p[k]);return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0;});
    const edges=[['A','B'],['B','C'],['C','A'],['A1','B1'],['B1','C1'],['C1','A1'],['A','A1'],['B','B1'],['C','C1']];
    const pair=model.pairs[g.pair||'diagonals'],selected=pair.lines;
    let mark='';
    if(g.reveal&&g.pair==='diagonals'&&model.perpendicular&&!mini){
      const origin=v.O,unit=(a,b)=>{const d=v[b].map((n,i)=>n-v[a][i]),n=Math.hypot(...d);return d.map(x=>x/n);},u=unit('O','N'),w=unit('O','M'),d=Math.min(g.base,model.altitude,g.height)*.09;
      const points=[u,u.map((n,i)=>n+w[i]),w].map(dir=>pt(origin.map((n,i)=>n+d*dir[i])));
      mark=`<path d="M${points.map(a=>a.slice(0,2).join(' ')).join('L')}" fill="none" stroke="#a27735" stroke-width="1.8" aria-label="空间交点 O 的真实直角标记"/>`;
    }
    const sceneLabel=g.reveal?`${pairNames[g.pair||'diagonals']}，${pair.relation}，夹角${fmt(pair.angle)}度`:'直三棱柱与棱上点的连线，夹角尚未揭示';
    return `<svg viewBox="0 0 600 ${mini?300:450}" ${mini?'aria-hidden="true"':`role="img" aria-label="${sceneLabel}"`}><defs><pattern id="prism-grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#c5d3bf"/></pattern></defs>${!mini?'<rect width="600" height="450" fill="url(#prism-grid)"/>':''}${faces.map((f,i)=>({f,i,depth:f.reduce((s,k)=>s+p[k][2],0)/f.length})).filter(x=>visible[x.i]).sort((a,b)=>a.depth-b.depth).map(({f})=>`<polygon points="${f.map(k=>p[k].slice(0,2).join(',')).join(' ')}" fill="#dbe5d6" fill-opacity=".38"/>`).join('')}${g.plane?`<polygon points="${['A','M','N','A1'].map(k=>p[k].slice(0,2).join(',')).join(' ')}" fill="#edc982" fill-opacity=".29" stroke="#d0a15b" stroke-dasharray="4 5"/>`:''}${edges.map(([a,b])=>{const front=faces.some((f,i)=>visible[i]&&f.includes(a)&&f.includes(b));return front?line(a,b,'stroke="#577b64" stroke-width="1.8"'):g.hidden?line(a,b,'stroke="#9eb19b" stroke-width="1.3" stroke-dasharray="5 5"'):'';}).join('')}${g.connectors?line('A','M','stroke="#b69d70" stroke-width="1.4" stroke-dasharray="4 4"')+line('M','N','stroke="#b69d70" stroke-width="1.4" stroke-dasharray="4 4"'):''}${g.diagonal?selected.map(([a,b],i)=>line(a,b,`stroke="${i?'#c08b43':'#197d68'}" stroke-width="3.2"`)).join(''):''}${mark}${!mini?Object.entries(p).filter(([k])=>k!=='O'||g.reveal&&g.pair==='diagonals').map(([k,[x,y]])=>`<circle cx="${x}" cy="${y}" r="${k==='M'||k==='N'?4.8:3}" fill="${k==='M'||k==='N'?'#c2944b':'#557760'}" stroke="#f5f7ed" stroke-width="1"/><text x="${x+(k==='M'||k==='N'?12:x<300?-12:12)}" y="${y+(k==='M'||k==='N'?15:y<220?-11:17)}" fill="#496650" font-size="14" font-weight="550" text-anchor="middle">${geoNames[k]}</text>`).join(''):''}${!mini?`<text x="25" y="29" font-size="10" fill="#83967c" letter-spacing="1.5">TRIANGULAR PRISM · DISCOVER A RELATION</text><text x="300" y="428" text-anchor="middle" fill="#80947a" font-size="11">拖动旋转 · 屏幕夹角随视角变化，空间夹角由坐标计算</text>`:''}</svg>`;
  }
  function cutawaySVG(g) {
    if(!g.plane)return '';
    const m=C.prism(g),scale=110/Math.max(m.AM,g.height),w=m.AM*scale,h=g.height*scale,left=40,top=26;
    return `<div class="cutaway-inner"><svg viewBox="0 0 210 180" role="img" aria-label="截面 AMNA₁ 的正面视图"><rect x="${left}" y="${top}" width="${w}" height="${h}" fill="#fbf4e5" stroke="#baa16b" stroke-width="1.5"/><path d="M${left} ${top+h}L${left+w} ${top}" stroke="#197d68" stroke-width="2.3"/><path d="M${left} ${top}L${left+w} ${top+h}" stroke="#c08b43" stroke-width="2.3"/>${g.reveal&&m.perpendicular?`<path d="M${left+w/2-6} ${top+h/2+6}l6 6 6 -6" fill="none" stroke="#8b743e" stroke-width="1.4"/>`:''}<g font-size="11" fill="#60745e"><text x="${left-16}" y="${top-4}">A₁</text><text x="${left+w+6}" y="${top-4}">N</text><text x="${left-13}" y="${top+h+16}">A</text><text x="${left+w+6}" y="${top+h+16}">M</text><text x="${left+w/2}" y="${top+h+34}" text-anchor="middle">AM = ${fmt(m.AM)}</text><text x="${left+w+16}" y="${top+h/2}" text-anchor="middle" transform="rotate(90 ${left+w+16} ${top+h/2})">AA₁ = ${fmt(g.height)}</text></g></svg><div><strong>把辅助截面单独转向正面</strong><p>${g.reveal?(m.square?'原题的这个截面是正方形，两条对角线垂直。':'当前截面是矩形；对角线的夹角随边长比例变化。'):'先观察这个截面的形状，再判断两条对角线的关系。'}</p><small>这是同一个三维截面的正视图，空间位置不变。</small></div></div>`;
  }


root.ZModel={render:prismSVG,cutaway:cutawaySVG};})(globalThis);
