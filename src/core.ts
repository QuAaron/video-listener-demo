export const TARGET_RATE = 16000;
export const TIME_BASIS = 'session-elapsed-not-player-time';
export const MODELS = {tiny:'onnx-community/whisper-tiny',base:'onnx-community/whisper-base'} as const;
export type ModelKey = keyof typeof MODELS;
export type AudioJob = {audio:Float32Array;rate:number;start:number;end:number};
export type Transcript = {start:number;end:number;text:string};
export function downmix(channels:Float32Array[]):Float32Array {
 if(!channels.length) return new Float32Array();
 const n=channels[0].length;
 if(channels.some(c=>c.length!==n)) throw Error('声道长度不同');
 const out=new Float32Array(n);for(const c of channels)for(let i=0;i<n;i++)out[i]+=c[i]/channels.length;
 return out;
}
/** Windowed sinc low-pass resampling. Sample rate metadata is never merely relabeled. */
export function resample(input:Float32Array,from:number,to=TARGET_RATE):Float32Array {
 if(from<=0||to<=0)throw Error('无效采样率');
 if(from===to)return input.slice();
 const out=new Float32Array(Math.floor(input.length*to/from));
 const cutoff=Math.min(1,to/from)*0.94, radius=24;
 for(let i=0;i<out.length;i++){
  const pos=i*from/to;let sum=0,weights=0;
  for(let j=Math.ceil(pos-radius);j<=Math.floor(pos+radius);j++){
   if(j<0||j>=input.length)continue;
   const d=pos-j,x=Math.PI*d*cutoff;
   const w=(Math.abs(x)<1e-9?1:Math.sin(x)/x)*cutoff*(0.5+0.5*Math.cos(Math.PI*d/radius));
   sum+=input[j]*w;weights+=w;
  }out[i]=weights?sum/weights:0;
 }return out;
}
export function hasSpeechEnergy(a:Float32Array,threshold=0.003):boolean {
 // Energy gate, NOT a neural VAD: rejects silence, cannot distinguish music from speech.
 for(let s=0;s<a.length;s+=320){let sum=0;const n=Math.min(320,a.length-s);for(let i=0;i<n;i++)sum+=a[s+i]**2;if(Math.sqrt(sum/n)>threshold)return true;}
 return false;
}
export class Chunker {
 private buffer=new Float32Array();private offset=0;private fresh=0;
 constructor(readonly rate:number,readonly seconds=12,readonly overlap=1,readonly origin=0){if(rate<=0||seconds<=overlap||overlap<0)throw Error('分块参数错误');}
 push(samples:Float32Array):AudioJob[]{
  const all=new Float32Array(this.buffer.length+samples.length);all.set(this.buffer);all.set(samples,this.buffer.length);this.buffer=all;this.fresh+=samples.length;
  const jobs:AudioJob[]=[];const size=Math.round(this.seconds*this.rate),stride=Math.round((this.seconds-this.overlap)*this.rate);
  while(this.buffer.length>=size){jobs.push(this.make(this.buffer.slice(0,size)));this.buffer=this.buffer.slice(stride);this.offset+=stride;this.fresh=this.buffer.length-Math.round(this.overlap*this.rate);}
  return jobs;
 }
 private make(a:Float32Array):AudioJob{return {audio:a,rate:this.rate,start:this.origin+this.offset/this.rate,end:this.origin+(this.offset+a.length)/this.rate};}
 flush():AudioJob|undefined{const j=this.fresh>this.rate*0.15&&this.buffer.length?this.make(this.buffer):undefined;this.buffer=new Float32Array();this.fresh=0;return j;}
}
export function dedupeBoundary(previous:string,current:string):string {
 const norm=(s:string)=>[...s].map((c,i)=>({c:c.toLowerCase(),i})).filter(x=>/[\p{L}\p{N}]/u.test(x.c));
 const p=norm(previous).map(x=>x.c).join(''), c=norm(current),s=c.map(x=>x.c).join('');
 for(let n=Math.min(80,p.length,s.length);n>=4;n--)if(p.endsWith(s.slice(0,n))){
  const prefix=s.slice(0,n);if(/^[a-z0-9]+$/.test(prefix)&&n<8)continue;
  const cut=c[n-1].i+1;return current.slice(cut).replace(/^[\s，。,.!?！？;；:：]+/u,'');
 }return current;
}
export function formatTime(s:number){s=Math.max(0,s);const m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${(s%60).toFixed(1).padStart(4,'0')}`;}
export type Phase='idle'|'loading'|'ready'|'selecting'|'capturing'|'draining'|'done'|'error';
const allowed:Record<Phase,Phase[]>={idle:['loading'],loading:['ready','error','idle'],ready:['selecting','draining','loading','idle'],selecting:['capturing','ready','error','idle'],capturing:['draining','error','idle'],draining:['done','error','idle'],done:['loading','idle'],error:['loading','idle']};
export class Lifecycle{phase:Phase='idle';set(next:Phase){if(!allowed[this.phase].includes(next))throw Error(`非法状态转换 ${this.phase} → ${next}`);this.phase=next;}cancel(){this.phase='idle';}}
/** One inference at a time, bounded memory, generation guards discard canceled completions. */
export class SerialQueue<T,R>{
 private pending:T[]=[];private running=false;private generation=0;private waiters:Array<()=>void>=[];
 constructor(private work:(t:T)=>Promise<R>,private result:(r:R,t:T)=>void,private failure:(e:unknown)=>void,private change:()=>void=()=>{},readonly max=8){}
 get size(){return this.pending.length+(this.running?1:0);}
 add(t:T){if(this.size>=this.max)return false;this.pending.push(t);this.change();void this.run();return true;}
 private async run(){if(this.running)return;this.running=true;const g=this.generation;
  while(this.pending.length&&g===this.generation){const t=this.pending.shift()!;try{const r=await this.work(t);if(g===this.generation)this.result(r,t);}catch(e){if(g===this.generation)this.failure(e);}this.change();}
  this.running=false;this.change();if(this.pending.length)void this.run();else this.waiters.splice(0).forEach(f=>f());
 }
 drain(){return this.size?new Promise<void>(r=>this.waiters.push(r)):Promise.resolve();}
 cancel(){this.generation++;this.pending=[];this.waiters.splice(0).forEach(f=>f());this.change();}
}
