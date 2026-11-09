import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createConsoleApp} from './platform/consoleApp.js';
test('hosting verification mode never connects a registry or accepts workforce access, demo sessions or public intake',async()=>{
 const origin='https://school-admin.example.invalid';
 assert.throws(()=>createConsoleApp({origin,setupOnly:true,store:{}}),/must not have a database/);
 const server=createConsoleApp({origin,setupOnly:true}).listen(0,'127.0.0.1');await once(server,'listening');
 const get=(path,method='GET')=>new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{Host:'school-admin.example.invalid','Content-Type':'application/json'}},r=>{let raw='';r.on('data',b=>raw+=b);r.on('end',()=>resolve({status:r.statusCode,raw}));});req.on('error',reject);req.end();});
 try{
  assert.equal((await get('/healthz')).status,200);
  assert.equal(JSON.parse((await get('/api/status')).raw).signInConfigured,false);
  for(const path of ['/api/session','/api/school-requests','/api/institutions'])assert.equal((await get(path)).status,401);
  assert.equal((await get('/auth/start')).status,503);
  assert.equal((await get('/api/intake/school-requests','POST')).status,503);
  assert.equal((await get('/api/demo-session','POST')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
