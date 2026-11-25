import {describe,it,expect} from 'vitest';
import {unwrapTranscriptionMessage,normalizeAsrResult,describeRaw,audioStats,completionOutcome} from '../src/protocol';
import {SerialQueue,type AudioJob} from '../src/core';
import {recognize} from '../src/asr';
describe('Worker信封与ASR载荷回归',()=>{
 it('reproduces the old bug: envelope.text is absent even though envelope.result.text exists',()=>{
  const envelope={id:7,type:'result',result:{text:'real decoded output',chunks:[],silent:false}};
  expect((envelope as any).text).toBeUndefined();
  expect(unwrapTranscriptionMessage(structuredClone(envelope)).text).toBe('real decoded output');
 });
 it('passes decoded payload through exactly the queue callback used to render text',async()=>{
  const displayed:string[]=[];
  const q=new SerialQueue<AudioJob,ReturnType<typeof unwrapTranscriptionMessage>>(async job=>{
   const received=structuredClone(job,{transfer:[job.audio.buffer as ArrayBuffer]});expect(job.audio.length).toBe(0);expect(received.audio.length).toBe(16000);
   return unwrapTranscriptionMessage(structuredClone({id:1,type:'result',result:{text:'worker payload',chunks:[],silent:false}}));
  },r=>displayed.push(r.text),e=>{throw e;});
  q.add({audio:new Float32Array(16000),rate:16000,start:0,end:1});await q.drain();expect(displayed).toEqual(['worker payload']);
 });
 it('rejects malformed envelopes and non-silent empty results, not silent success',()=>{
  expect(()=>unwrapTranscriptionMessage({text:'unwrapped accidentally'})).toThrow('包裹层');
  expect(()=>unwrapTranscriptionMessage({type:'result',result:{text:'',chunks:[]}})).toThrow('空文字');
  expect(()=>unwrapTranscriptionMessage({type:'error',message:'WASM op failed'})).toThrow('WASM op failed');
  expect(unwrapTranscriptionMessage({type:'result',result:{silent:true}}).silent).toBe(true);
 });
 it('normalizes single-item array and chunks-only responses while exposing fallback',()=>{
  expect(normalizeAsrResult([{text:' hello ',chunks:[]}]).text).toBe('hello');
  expect(normalizeAsrResult({chunks:[{text:' hello'},{text:' world'}]})).toMatchObject({text:'hello world',textFrom:'chunks'});
  expect(()=>normalizeAsrResult([])).toThrow();expect(()=>normalizeAsrResult(null)).toThrow();
 });
 it('diagnostics report shape/text and numeric energy without recording audio arrays',()=>{
  expect(describeRaw([{text:'abc',chunks:[]}])).toMatchObject({kind:'array',arrayLength:1,text:'abc',keys:['text','chunks']});
  expect(audioStats(new Float32Array([.5,-.5]),16000)).toMatchObject({samples:2,rms:.5,peak:.5,nonFinite:0});
  expect(audioStats(new Float32Array([NaN]),16000).nonFinite).toBe(1);
 });
 it('empty, failed and missing job results can never yield success',()=>{
  expect(completionOutcome({queued:1,completed:1,failed:0},0).ok).toBe(false);
  expect(completionOutcome({queued:1,completed:0,failed:1},0).ok).toBe(false);
  expect(completionOutcome({queued:0,completed:0,failed:0},0).ok).toBe(false);
  expect(completionOutcome({queued:2,completed:1,failed:0},1).ok).toBe(false);
  expect(completionOutcome({queued:1,completed:1,failed:0},1).ok).toBe(true);
 });
 it('recognizer records raw return before refusing empty non-silent inference',async()=>{
  const stages:string[]=[];
  await expect(recognize(async()=>({text:'',chunks:[]}),{audio:new Float32Array(16000).fill(.02),rate:16000,start:0,end:1},'english',stage=>stages.push(stage))).rejects.toThrow('空文字');
  expect(stages).toEqual(['input-audio','resampled-audio','energy-gate','inference-start','inference-raw-result']);
 });
 it('silence remains distinguishable from empty inference and does not invoke model',async()=>{
  let invoked=false;const result=await recognize(async()=>{invoked=true;return {text:'unexpected'};},{audio:new Float32Array(16000),rate:16000,start:0,end:1},'english');expect(invoked).toBe(false);expect(result.silent).toBe(true);
 });
});
