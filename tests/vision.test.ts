import {describe,it,expect} from 'vitest';
import {planVision,VISION_BUDGET,parseVision,parseOverview,windowMessages,ALWAYS_WARNINGS} from '../src/vision-core';
const frame=(id:number,time:number,signature=`f${id}`)=>({id,time,signature});
describe('真实视觉输入预算与时间证据',()=>{
 it('aligns transcript by overlapping session windows; no URL/subtitle shortcut',()=>{
  const p=planVision([frame(1,5),frame(2,35)],[{start:0,end:20,text:'first'},{start:29,end:31,text:'boundary'},{start:40,end:50,text:'last'}],60);
  expect(p.windows[0].transcript).toContain('first');expect(p.windows[0].transcript).toContain('boundary');expect(p.windows[0].transcript).not.toContain('last');expect(p.windows[1].transcript).toContain('boundary');expect(p.windows[1].frames[0].id).toBe(2);
 });
 it('caps windows and images and spreads sampled coverage, retaining first and last',()=>{
  const p=planVision(Array.from({length:120},(_,i)=>frame(i+1,i*10)),[],1200);
  expect(p.windows).toHaveLength(8);expect(p.frameCount).toBeLessThanOrEqual(16);expect(p.skippedWindows).toBe(32);expect(p.windows[0].start).toBe(0);expect(p.windows.at(-1)?.start).toBe(1170);
 });
 it('deduplicates identical image evidence within windows and suppresses repeat jobs',()=>{
  const p=planVision([frame(1,1,'same'),frame(2,10,'same'),frame(3,20,'same')],[],30);expect(p.frameCount).toBe(1);
  const again=planVision([frame(1,1,'same'),frame(2,10,'same'),frame(3,20,'same')],[],30,p.windows.map(w=>w.key));expect(again.windows).toHaveLength(0);expect(again.duplicates).toBe(1);
 });
 it('does not dedupe new narration over the same graph and caps text with warning',()=>{
  const old=planVision([frame(1,1)],[{start:0,end:10,text:'old'}],30);
  const p=planVision([frame(1,1)],[{start:0,end:10,text:'x'.repeat(3000)}],30,old.windows.map(w=>w.key));expect(p.windows[0].transcript.length).toBe(1800);expect(p.windows[0].warnings.join()).toContain('截断');
 });
 it('never turns transcript-only input into a visual result',()=>{expect(planVision([],[{start:0,end:30,text:'claims'}],30).windows).toHaveLength(0);expect(()=>planVision([],[],NaN)).toThrow();});
 it('includes explicit ASR/financial/image-quality uncertainty with image inputs',()=>{
  const w=planVision([frame(1,5)],[{start:0,end:10,text:'untrusted ASR'}],30,[],['ASR失败块']).windows[0];const m=windowMessages(w,['actual-base64']);expect(m[1].images).toEqual(['actual-base64']);expect(m[1].content).toContain('ASR失败块');expect(m[1].content).toContain('股票码');expect(m[1].content).toContain('frame-1 @5.0s');expect(ALWAYS_WARNINGS.length).toBeGreaterThan(1);
 });
});
describe('视觉模型返回格式，不用空结果伪装成功',()=>{
 const valid={readability:'partial',speakerClaims:['speaker'],chartObservations:['line rises'],jointSummary:'supports narration',conflicts:[],uncertainties:['cannot read tiny numbers']};
 it('validates structure and preserves separate speaker, chart, joint and uncertainty fields',()=>{expect(parseVision(JSON.stringify(valid))).toEqual(valid);});
 it('rejects missing / empty / malformed actual model return',()=>{for(const v of ['', '{}','null','not JSON',JSON.stringify({...valid,speakerClaims:'wrong'})])expect(()=>parseVision(v)).toThrow();});
 it('unreadable never counts invented observations as evidence',()=>{expect(parseVision(JSON.stringify({...valid,readability:'unreadable',chartObservations:['invented ticker']})).chartObservations).toEqual([]);});
 it('overview requires actual content and schema',()=>{expect(()=>parseOverview('{}')).toThrow();expect(parseOverview(JSON.stringify({overview:'summary',agreements:[],conflicts:[],uncertainties:[]})).overview).toBe('summary');});
});

import {composeOverview,type VisionResult} from '../src/vision-core';
it('whole-session evidence rollup cannot attach one windows conflict/price to another unreadable window',()=>{
 const base={model:'unit fixture only',milliseconds:1,images:1,warnings:[]};
 const content={readability:'readable' as const,speakerClaims:['unit speaker'],chartObservations:['unit visual'],jointSummary:'unit visual supports lecture',conflicts:['100 vs 80'],uncertainties:[]};
 const rs:VisionResult[]=[{...base,window:{id:'a',key:'a',start:0,end:30,frames:[{id:1,time:15}],transcript:'',warnings:[]},content},{...base,window:{id:'b',key:'b',start:30,end:60,frames:[{id:2,time:45}],transcript:'',warnings:[]},content:{...content,readability:'unreadable',jointSummary:'must not be treated as reliable',conflicts:[]}}];
 const overview=composeOverview(rs,'bounded sample');expect(overview.conflicts).toEqual(['[0.0–30.0秒] 100 vs 80']);expect(overview.overview).toContain('[30.0–60.0秒] 画面看不清');expect(overview.overview).not.toContain('must not be treated as reliable');
});

import {evidenceWarnings} from '../src/vision-core';
it('warns rather than silently trusting numbers absent from visual observation field',()=>{
 const c={readability:'partial' as const,speakerClaims:['80'],chartObservations:['synthetic title only'],jointSummary:'chart shows 100 to 120',conflicts:[],uncertainties:[]};expect(evidenceWarnings(c).join()).toContain('100');expect(evidenceWarnings(c).join()).toContain('120');expect(c.chartObservations).toEqual(['synthetic title only']);expect(evidenceWarnings({...c,chartObservations:['100 to 120']})).toEqual([]);
});
it('untrusted spoken words cannot switch actual ASR provenance into synthetic-test mode',()=>{
 const w=planVision([{id:1,time:10}],[{start:0,end:20,text:'讲者说这是非ASR模块'}],30).windows[0];const messages=windowMessages(w,['abc']);expect(messages[1].content).toContain('讲解（自动转写，可能有误）');expect(messages[1].content).not.toContain('合成测试讲解（非ASR）');
});
