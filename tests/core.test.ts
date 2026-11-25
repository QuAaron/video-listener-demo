import {describe,it,expect,vi} from 'vitest';
import {Chunker,resample,downmix,hasSpeechEnergy,dedupeBoundary,Lifecycle,SerialQueue,TIME_BASIS,formatTime} from '../src/core';
describe('音频数据处理',()=>{
 it('downmix preserves mono and averages channels',()=>{expect([...downmix([new Float32Array([1,-1]),new Float32Array([-1,1])])]).toEqual([0,0]);});
 it('resamples 48k to 16k with proper duration and anti-alias filtering',()=>{const a=Float32Array.from({length:48000},(_,i)=>Math.sin(2*Math.PI*1000*i/48000));const out=resample(a,48000);expect(out.length).toBe(16000);expect(out[4]).toBeCloseTo(1,1);const high=Float32Array.from({length:48000},(_,i)=>Math.sin(2*Math.PI*12000*i/48000));const filtered=resample(high,48000);expect(Math.sqrt(filtered.slice(100,-100).reduce((s,v)=>s+v*v,0)/(filtered.length-200))).toBeLessThan(0.02);});
 it('handles 44.1k, empty, identity and invalid rates',()=>{expect(resample(new Float32Array(44100),44100).length).toBe(16000);expect(resample(new Float32Array(),48000).length).toBe(0);expect(resample(new Float32Array([1]),16000)[0]).toBe(1);expect(()=>resample(new Float32Array(),0)).toThrow();});
 it('silence filter does not fabricate text and preserves short energy bursts',()=>{expect(hasSpeechEnergy(new Float32Array(16000))).toBe(false);const a=new Float32Array(16000);a.fill(.02,320,640);expect(hasSpeechEnergy(a)).toBe(true);});
});
describe('分块和会话时间语义',()=>{
 it('12s chunks with 1s overlap retain exact source offsets, origin and final tail',()=>{const c=new Chunker(10,12,1,2);expect(c.push(new Float32Array(60))).toEqual([]);const jobs=c.push(new Float32Array(180));expect(jobs.map(j=>[j.start,j.end])).toEqual([[2,14],[13,25]]);const tail=c.flush()!;expect([tail.start,tail.end]).toEqual([24,26]);expect(c.flush()).toBeUndefined();});
 it('does not transcribe overlap-only tail twice',()=>{const c=new Chunker(10);expect(c.push(new Float32Array(120))).toHaveLength(1);expect(c.flush()).toBeUndefined();});
 it('session time explicitly is not player time',()=>{expect(TIME_BASIS).toBe('session-elapsed-not-player-time');expect(formatTime(75.3)).toBe('01:15.3');});
 it('boundary dedupe works for Chinese and English but retains short repeats',()=>{expect(dedupeBoundary('我们讲到检索增强生成','检索增强生成，然后开始演示')).toBe('然后开始演示');expect(dedupeBoundary('ask not what your country','your country can do for you')).toBe('can do for you');expect(dedupeBoundary('yes','yes it is')).toBe('yes it is');});
});
describe('生命周期与取消',()=>{
 it('prevents duplicate start and allows drain rather than losing pending work',()=>{const l=new Lifecycle();l.set('loading');l.set('ready');l.set('selecting');l.set('capturing');expect(()=>l.set('selecting')).toThrow();l.set('draining');l.set('done');l.cancel();expect(l.phase).toBe('idle');});
 it('queue processes serially and drains after all results',async()=>{const seen:number[]=[];const q=new SerialQueue(async(n:number)=>n*2,(n)=>seen.push(n),e=>{throw e;});q.add(1);q.add(2);await q.drain();expect(seen).toEqual([2,4]);expect(q.size).toBe(0);});
 it('bounds memory and ignores in-flight completion after cancel',async()=>{let resolve!:(v:number)=>void;const result=vi.fn();const q=new SerialQueue<number,number>(()=>new Promise(r=>{resolve=r;}),result,vi.fn(),()=>{},2);expect(q.add(1)).toBe(true);expect(q.add(2)).toBe(true);expect(q.add(3)).toBe(false);q.cancel();resolve(1);await q.drain();expect(result).not.toHaveBeenCalled();expect(q.size).toBe(0);});
 it('continues and drains after explicit inference errors',async()=>{const fail=vi.fn(),result=vi.fn();const q=new SerialQueue(async(n:number)=>{if(n===1)throw Error('test');return n;},result,fail);q.add(1);q.add(2);await q.drain();expect(fail).toHaveBeenCalledOnce();expect(result).toHaveBeenCalledWith(2,2);});
});
