import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startSource} from '../provider/server.mjs';
import {startIntake} from '../src/app.mjs';

const directory=await mkdtemp(join(tmpdir(),'intake-demo-'));
const source=await startSource();
const intake=await startIntake({origin:source.origin,directory});
const collect=async ()=>{
 const response=await fetch(intake.origin+'/collect',{method:'POST'});
 const receipt=await response.json();
 if(!response.ok)throw new Error(JSON.stringify(receipt));
 return receipt;
};
const view=async ()=>(await(await fetch(intake.origin+'/interpretations')).json());
try{
 console.log('== 冲突阶段收件（多发布者不同父关系，观测悬置）==');
 source.setPhase('conflict');
 await collect();
 let current=await view();
 console.log(JSON.stringify({summary:current.summary,pending:current.items.filter(item=>item.status==='pending')},null,2));

 console.log('== 正常阶段收件（历史冲突证据仍在，无默认权威故保持悬置）==');
 source.setPhase('normal');
 await collect();
 current=await view();
 console.log(JSON.stringify({summary:current.summary,note:'冲突证据已入档，正常资料不构成撤回，观测维持悬置'},null,2));

 console.log('== 重设阶段收件（新 epoch 暂无动态关系，禁止跨边界解释）==');
 source.setPhase('reset');
 await collect();
 const resetView=await view();
 console.log(JSON.stringify({summary:resetView.summary,items:resetView.items.map(item=>({observationId:item.observationId,status:item.status,reason:item.reason,blocked:item.blocked.map(edge=>edge.reason)}))},null,2));

 console.log('== 晚到补齐收件（新 epoch 动态关系到达，补齐悬置观测）==');
 source.setPhase('backfill');
 await collect();
 const finalView=await view();
 console.log(JSON.stringify({summary:finalView.summary,items:finalView.items.map(item=>({observationId:item.observationId,epoch:item.epoch,status:item.status,root:item.root,path:item.path.map(edge=>`${edge.parent}<-${edge.child}(${edge.publisher})`)}))},null,2));

 console.log('== 原文凭据 ==');
 console.log(JSON.stringify(await(await fetch(intake.origin+'/receipts')).json(),null,2));
}finally{await intake.close();await source.close();await rm(directory,{recursive:true,force:true});}
