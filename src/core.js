(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const USER='student01', PASSWORD='zhixu123';
  function authenticate(username,password){return username.trim()===USER&&password===PASSWORD;}
  function initialLibrary(seed){return {schema:1,owner:USER,items:clone(seed.materials),viewed:[],draft:null,lastAddedId:null};}
  function validLibrary(value){return value&&value.schema===1&&value.owner===USER&&Array.isArray(value.items)&&value.items.every(m=>m&&typeof m.id==='string'&&typeof m.title==='string'&&Array.isArray(m.tags)&&typeof m.kind==='string')&&Array.isArray(value.viewed);}
  function findExisting(library,exampleId){return library.items.find(m=>m.exampleId===exampleId)||null;}
  function validateMetadata(meta){
    if(!meta.title||!meta.title.trim())return '请为这道题填写标题。';
    if(meta.title.trim().length>80)return '标题最多 80 个字。';
    if(!['立体几何','我的题目'].includes(meta.collection))return '请选择资料分类。';
    if((meta.note||'').length>300)return '学习备注最多 300 个字。';
    if(!meta.confirmed)return '请先核对题图、题干与已知条件，再勾选确认。';
    return '';
  }
  function addExample(library,example,meta,now){
    const error=validateMetadata(meta);if(error)return {error};
    if(!example||example.id!=='EX-PRISM-001'||!example.parsed)return {error:'请先完成预置题图的解析。'};
    const existing=findExisting(library,example.id);if(existing)return {library:clone(library),item:clone(existing),duplicate:true};
    const item={id:'MY-'+example.id,exampleId:example.id,title:meta.title.trim(),kind:'question',typeLabel:'我的题目',collection:meta.collection,tags:clone(example.parsed.tags),summary:'从预置题图整理的三棱柱题目，包含条件、空间关系和辅助截面讲解。',createdAt:now,source:'预置题图 · 演示解析',note:(meta.note||'').trim(),parsed:clone(example.parsed)};
    const updated=clone(library);updated.items.unshift(item);updated.draft=null;updated.lastAddedId=item.id;
    return {library:updated,item,duplicate:false};
  }
  function filterMaterials(items,{query='',kind='all'}={}){
    const q=query.trim().toLowerCase();return items.filter(m=>(kind==='all'||m.kind===kind)&&(!q||[m.title,m.summary,m.collection,...m.tags].join(' ').toLowerCase().includes(q))).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  }
  const api={clone,USER,PASSWORD,authenticate,initialLibrary,validLibrary,findExisting,validateMetadata,addExample,filterMaterials};
  root.ZUser=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
