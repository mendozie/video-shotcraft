import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {projectApi} from './project-api.mjs';

test('HTTP persistence refuses stale/project-confused writes and serves fresh media ranges',async()=>{
  const fixture=mkdtempSync(path.join(tmpdir(),'Mendex-video-api-'));
  const root=path.join(fixture,'tool'),project=path.join(fixture,'video');
  mkdirSync(root);mkdirSync(path.join(project,'src'),{recursive:true});mkdirSync(path.join(project,'public'));
  symlinkSync(path.join(project,'src'),path.join(root,'proj'),process.platform==='win32'?'junction':'dir');
  const stack=[];
  projectApi(root).configureServer({middlewares:{use:(prefix,fn)=>stack.push(typeof prefix==='function'?['',prefix]:[prefix,fn])}});
  const server=createServer((req,res)=>{
    let i=0;const original=req.url;
    const next=()=>{const item=stack[i++];if(!item){res.statusCode=404;res.end();return;}const [prefix,fn]=item;if(!original.startsWith(prefix))return next();req.url=original.slice(prefix.length)||'/';fn(req,res,next);};next();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const state=await (await fetch(base+'/api/project')).json();
    const montage={name:'HTTP test',width:1920,height:1080,fps:30,tracks:[]};
    const save=body=>fetch(base+'/api/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await save({...state,project:montage})).status,200);
    assert.equal((await save({...state,project:montage})).status,409);
    assert.equal((await save({...state,project:montage,projectId:'another-project'})).status,409);
    writeFileSync(path.join(project,'public','new.txt'),'first-bytes');
    assert.equal(await (await fetch(base+'/new.txt')).text(),'first-bytes');
    writeFileSync(path.join(project,'public','new.txt'),'updated-bytes');
    const range=await fetch(base+'/new.txt',{headers:{Range:'bytes=0-6'}});
    assert.equal(range.status,206);assert.equal(await range.text(),'updated');
    const invalid=await fetch(base+'/new.txt',{headers:{Range:'bytes=900-1000'}});assert.equal(invalid.status,416);
  }finally{await new Promise(r=>server.close(r));}
});
