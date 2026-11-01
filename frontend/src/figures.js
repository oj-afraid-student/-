(function(root){
  function cube(vertical=false){
    const vertices=[[0,0,0],[2,0,0],[2,2,0],[0,2,0],[0,0,2],[2,0,2],[2,2,2],[0,2,2]],names=['A','B','C','D','A₁','B₁','C₁','D₁'];
    const points=vertices.map(([x,y,z])=>{x-=1;y-=1;z-=1;const u=x*Math.cos(-.62)-y*Math.sin(-.62),h=x*Math.sin(-.62)+y*Math.cos(-.62);return [245+u*84,175+(h*Math.sin(.42)-z*Math.cos(.42))*84];});
    const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],hidden=new Set(['2-3','3-0','3-7']);
    const line=(a,b,color,width,dashed=false)=>`<path d="M${points[a].join(' ')}L${points[b].join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" ${dashed?'stroke-dasharray="5 5"':''}/>`;
    return `<svg viewBox="0 0 490 345" role="img" aria-label="正方体 ABCD—A₁B₁C₁D₁ 的标准顶点配图"><polygon points="${[0,1,2,3].map(i=>points[i].join(',')).join(' ')}" fill="#e6eee0" opacity=".7"/>${edges.map(([a,b])=>line(a,b,'#8ea48c',1.6,hidden.has(a+'-'+b))).join('')}${vertical?line(0,4,'#247c65',3):line(0,1,'#247c65',3)+line(2,3,'#bd965d',3,true)}${points.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="3" fill="#6f896a"/><text x="${x+(x<245?-12:12)}" y="${y+(y<175?-12:19)}" fill="#56724e" font-size="14" text-anchor="middle">${names[i]}</text>`).join('')}</svg>`;
  }
  root.ZFigures={cube};
})(globalThis);
