(function(root){
  'use strict';
  function cookie(name){return document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
  async function request(path,{method='GET',data}={}){
    let response;
    try{response=await fetch('/api/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRFToken':decodeURIComponent(cookie('csrftoken'))},...(data===undefined?{}:{body:JSON.stringify(data)})});}
    catch{throw new Error('暂时无法连接服务，请确认本地服务正在运行后重试。');}
    const result=await response.json().catch(()=>({error:'请求未完成，请稍后重试。'}));
    if(!response.ok){const error=new Error(result.error||'请求未完成。');error.status=response.status;throw error;}
    return result;
  }
  root.ZApi={get:path=>request(path),post:(path,data={})=>request(path,{method:'POST',data})};
})(globalThis);
