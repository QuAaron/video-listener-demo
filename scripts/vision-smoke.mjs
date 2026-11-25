import {composeOverview} from '../src/vision-core.ts';
// Actual public synthetic image -> same local HTTP endpoint as browser. Never a browser simulation.
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),base='http://127.0.0.1:4183';
const cases=JSON.parse(await fs.readFile(root+'/public/vision-fixtures/cases.json','utf8'));
const results=[];
for(const [caseIndex,c] of cases.entries()){
 const image=await fs.readFile(root+'/public/vision-fixtures/'+c.image);
 const window={id:'window-0',key:'synthetic-'+c.id,start:caseIndex*30,end:(caseIndex+1)*30,frames:[{id:caseIndex+1,time:caseIndex*30+15,signature:c.image}],transcript:c.transcript,warnings:['明确标注的合成测试图与讲解（非ASR），不是真实股票行情。']};
 const before=Date.now();const response=await fetch(base+'/api/local-vision/analyze',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({window,images:[image.toString('base64')]}),signal:AbortSignal.timeout(245000)});
 const body=await response.json();
 const observations=body.content?.chartObservations?.join(' ')??'',uncertainties=body.content?.uncertainties?.join(' ')??'';
 let checks={http:response.ok};
 if(c.id==='clear')checks={...checks,titleOrTicker:/DEMO/.test(observations),readNumbers:/100/.test(observations)&&/120/.test(observations),trend:/升|涨|增/.test(observations+' '+body.content?.jointSummary),dip:/回落|下跌|下降|波动|回调|先升后降|后降再升/.test(observations+' '+body.content?.jointSummary),noSpuriousConflict:body.content?.conflicts?.length===0,axisRangeNotInvented:!/从100到140/.test(observations)};
 if(c.id==='conflict')checks={...checks,conflictFlagged:body.content?.conflicts?.length>0,visualEnd120:/120/.test(observations),speakerSeparate:/80/.test(body.content?.speakerClaims?.join(' ')??'')};
 if(c.id==='blurred')checks={...checks,notDeclaredReadable:body.content?.readability!=='readable',noInventedTickerOrNumbers:!/(DEMO|100|110|105|120)/i.test(observations),uncertainty:/不清|无法|模糊|不能|辨认|不确定/.test(uncertainties+' '+body.content?.jointSummary)};
 const entry={case:c.id,synthetic:true,notAsr:true,input:{file:c.image,bytes:image.length,window},expected:c.expected,status:response.status,elapsedSeconds:(Date.now()-before)/1000,checks,allChecksPassed:Object.values(checks).every(Boolean),output:body};results.push(entry);
 console.log(c.id,entry.elapsedSeconds,JSON.stringify(checks),JSON.stringify(body.content??body));
 await fs.mkdir(root+'/test-results',{recursive:true});await fs.writeFile(root+'/test-results/vision-smoke.json',JSON.stringify({testedAt:new Date().toISOString(),runtime:'Linux CPU standalone llama.cpp / real model, no browser GUI',modelRepo:'unsloth/Qwen3.5-2B-GGUF (base Qwen/Qwen3.5-2B), Q5_K_M + vision F16',results},null,2));
 if(!response.ok)break;
}
if(results.every(r=>r.status===200)){
 const actual=results.map(r=>({window:r.input.window,content:r.output.content,warnings:['合成测试'],model:r.output.model,milliseconds:r.elapsedSeconds*1000,images:1}));
 const before=Date.now();const content=composeOverview(actual,'三个独立合成测试，以0–30、30–60、60–90秒作测试索引，不是真实连续视频。');
 const checks={timeReferences:content.overview.includes('[0.0–30.0秒]')&&content.overview.includes('[60.0–90.0秒]'),conflictNotCopiedToBlurred:!content.conflicts.some(s=>s.startsWith('[60.0–90.0秒]')),unreadableDoesNotInventConclusion:content.overview.includes('[60.0–90.0秒] 画面看不清')};
 await fs.writeFile(root+'/test-results/vision-overview.json',JSON.stringify({method:'time-ordered-evidence-rollup-of-real-VLM-results; not another model pass',input:actual,status:200,elapsedSeconds:(Date.now()-before)/1000,checks,allChecksPassed:Object.values(checks).every(Boolean),output:{content}},null,2));console.log('overview evidence-rollup',checks);
 if(Object.values(checks).some(x=>!x))process.exitCode=1;
}
if(results.length!==cases.length||results.some(r=>!r.allChecksPassed))process.exitCode=1;
