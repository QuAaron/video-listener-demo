import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRecognizer,recognize} from '../src/asr';
import {downmix} from '../src/core';
import {unwrapTranscriptionMessage} from '../src/protocol';
import {env} from '@huggingface/transformers';
it.skipIf(process.env.RUN_ASR!=='1')('actual multilingual Whisper tiny q8 transcribes public JFK audio (Node CPU smoke; not browser WASM proof)',async()=>{
 env.cacheDir='./model-cache';env.allowLocalModels=false;
 const buf=readFileSync('public/test-jfk.wav');let at=12,rate=0,bits=0,format=0,channels=0,data:Buffer|undefined;
 while(at+8<=buf.length){const id=buf.toString('ascii',at,at+4),n=buf.readUInt32LE(at+4),p=at+8;if(id==='fmt '){format=buf.readUInt16LE(p);channels=buf.readUInt16LE(p+2);rate=buf.readUInt32LE(p+4);bits=buf.readUInt16LE(p+14);}if(id==='data')data=buf.subarray(p,p+n);at=p+n+(n%2);}
 if(!data||!rate||channels<1)throw Error('Sample WAV format unsupported');
 const samples=data.length/(bits/8)/channels;const ch=Array.from({length:channels},()=>new Float32Array(samples));for(let i=0;i<samples;i++)for(let c=0;c<channels;c++){const p=(i*channels+c)*(bits/8);ch[c][i]=format===3?data.readFloatLE(p):data.readInt16LE(p)/32768;}const audio=downmix(ch);
 const asr=await createRecognizer('tiny','cpu' as any,()=>{});
 try{const reports:Array<{stage:string;data:unknown}>=[];const payload=await recognize(asr,{audio,rate,start:0,end:audio.length/rate},'english',(stage,data)=>reports.push({stage,data}));const envelope=structuredClone({id:99,type:'result',result:payload});const result=unwrapTranscriptionMessage(envelope);mkdirSync('test-results',{recursive:true});writeFileSync('test-results/asr-smoke.json',JSON.stringify({testedAt:new Date().toISOString(),runtime:'Node CPU; not browser WASM',model:'onnx-community/whisper-tiny',dtype:'q8',source:'public/test-jfk.wav',inputRate:rate,sourceChannels:channels,wireEnvelopeKeys:Object.keys(envelope),reports,result},null,2));console.log('ACTUAL_ASR_RESULT',JSON.stringify(result));expect(result.text.toLowerCase()).toContain('country');expect(result.text.toLowerCase()).toContain('ask');}finally{await asr.dispose();}
},300000);
