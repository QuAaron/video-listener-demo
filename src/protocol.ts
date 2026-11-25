/** Shared wire protocol helpers. Keep Worker envelopes distinct from ASR payloads. */
export type AsrChunk={text?:string;timestamp?:[number|null,number|null]};
export type AsrResult={text:string;chunks:AsrChunk[];silent:boolean;textFrom:'text'|'chunks'|'silence'};
export function audioStats(audio:Float32Array,rate:number){
 let sum=0,peak=0,nonFinite=0;for(const v of audio){if(!Number.isFinite(v)){nonFinite++;continue;}sum+=v*v;peak=Math.max(peak,Math.abs(v));}
 return {samples:audio.length,sampleRate:rate,seconds:rate>0?audio.length/rate:0,rms:audio.length?Math.sqrt(sum/audio.length):0,peak,nonFinite};
}
export function describeRaw(raw:unknown){
 const array=Array.isArray(raw);const item=array?raw[0]:raw;const r=item&&typeof item==='object'?item as Record<string,unknown>:undefined;
 return {kind:raw===null?'null':array?'array':typeof raw,arrayLength:array?raw.length:undefined,keys:r?Object.keys(r):[],textType:typeof r?.text,text:typeof r?.text==='string'?r.text.slice(0,4000):undefined,chunks:Array.isArray(r?.chunks)?r!.chunks.slice(0,8).map(c=>({text:typeof c?.text==='string'?c.text.slice(0,500):undefined,timestamp:c?.timestamp})):undefined};
}
export function normalizeAsrResult(raw:unknown):AsrResult{
 if(Array.isArray(raw)){if(raw.length!==1)throw Error(`ASR返回了${raw.length}个结果，预期单个音频结果`);raw=raw[0];}
 if(!raw||typeof raw!=='object')throw Error('ASR返回格式错误：预期对象');
 const r=raw as Record<string,unknown>;
 const chunks:Array<AsrChunk>=Array.isArray(r.chunks)?r.chunks:[];
 let text=typeof r.text==='string'?r.text.trim():'';
 let textFrom:AsrResult['textFrom']='text';
 if(!text){text=chunks.map(c=>typeof c.text==='string'?c.text:'').join('').trim();textFrom='chunks';}
 if(!text)throw Error('ASR非静音片段返回空文字；未将空结果标记为成功，请查看并导出诊断。');
 return {text,chunks,silent:false,textFrom};
}
export function unwrapTranscriptionMessage(message:unknown):AsrResult{
 if(!message||typeof message!=='object')throw Error('Worker响应不是对象');
 const m=message as Record<string,unknown>;
 if(m.type==='error')throw Error(typeof m.message==='string'?m.message:'Worker推理失败');
 if(m.type!=='result'||!Object.hasOwn(m,'result'))throw Error('Worker响应格式错误：缺少result包裹层');
 const payload=m.result;
 if(payload&&typeof payload==='object'&&!Array.isArray(payload)&&(payload as Record<string,unknown>).silent===true)return {text:'',chunks:[],silent:true,textFrom:'silence'};
 return normalizeAsrResult(payload);
}
export function completionOutcome(stats:{queued:number;completed:number;failed:number},segments:number){
 if(stats.failed)return {ok:false,message:`任务结束，但有 ${stats.failed} 个音频块处理失败（已显示 ${segments} 段）。请检查并导出诊断。`};
 if(stats.completed+stats.failed<stats.queued)return {ok:false,message:'任务结束，但有音频块没有返回结果；请导出诊断，不代表识别成功。'};
 if(!segments)return {ok:false,message:stats.queued?'任务结束，但未获得有效转写（0 段）；可能是静音、能量门或推理异常，请查看诊断，不代表识别成功。':'任务结束，但没有收到可识别音频块。请检查播放/共享声音与诊断。'};
 return {ok:true,message:`已完成 ${segments} 段真实转写。可导出文本和会话包。`};
}
