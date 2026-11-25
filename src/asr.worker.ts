import {configureBrowserRuntime,createRecognizer,recognize} from './asr';
import {MODELS,type ModelKey} from './core';
configureBrowserRuntime();
let recognizer:any,key:ModelKey='tiny',device:'webgpu'|'wasm'='wasm';
const progress=(p:unknown)=>self.postMessage({type:'progress',data:p});
async function fallback(e:unknown){self.postMessage({type:'fallback',message:String(e)});try{await recognizer?.dispose();}catch{/* disposal cannot prevent fallback */}recognizer=undefined;device='wasm';recognizer=await createRecognizer(key,device,progress);self.postMessage({type:'backend',device});}
self.onmessage=async({data:m})=>{
 const report=(stage:string,data:unknown)=>self.postMessage({type:'diagnostic',entry:{requestId:m.id,stage,model:MODELS[key],backend:device,range:m.job?{start:m.job.start,end:m.job.end}:undefined,data}});
 try{
  if(m.type==='load'){
   key=m.model;device=m.device;report('model-load-start',{dtype:'q8',runtime:'Transformers.js 4.3.2'});
   try{recognizer=await createRecognizer(key,device,progress);}catch(e){if(device!=='webgpu')throw e;await fallback(e);}
   report('model-ready',{dtype:'q8'});self.postMessage({id:m.id,type:'ready',device});
  }else if(m.type==='transcribe'){
   let result;
   try{result=await recognize(recognizer,m.job,m.language,report);}catch(e){if(device!=='webgpu')throw e;report('webgpu-failure',{message:String(e)});await fallback(e);result=await recognize(recognizer,m.job,m.language,report);}
   self.postMessage({id:m.id,type:'result',result});
  }
 }catch(e){const message=e instanceof Error?e.message:String(e);report('stage-error',{message});self.postMessage({id:m.id,type:'error',message});}
};
