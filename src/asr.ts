import { pipeline, env } from '@huggingface/transformers';
import {MODELS,resample,hasSpeechEnergy,type ModelKey,type AudioJob} from './core';
import {audioStats,describeRaw,normalizeAsrResult,type AsrResult} from './protocol';
export type Diagnostic=(stage:string,data:unknown)=>void;
export function configureBrowserRuntime(){env.allowLocalModels=false;env.useBrowserCache=true;env.backends.onnx.wasm!.numThreads=1;env.backends.onnx.wasm!.proxy=false;env.backends.onnx.wasm!.wasmPaths=`${self.location.origin}/ort/`;}
export async function createRecognizer(key:ModelKey,device:'webgpu'|'wasm',progress:(p:unknown)=>void){
 return pipeline('automatic-speech-recognition',MODELS[key],{device,dtype:'q8',progress_callback:progress as never});
}
export async function recognize(recognizer:any,job:AudioJob,language:string,diagnostic:Diagnostic=()=>{}):Promise<AsrResult>{
 const input=audioStats(job.audio,job.rate);diagnostic('input-audio',input);
 if(!input.samples||input.nonFinite)throw Error('音频输入为空或含NaN/Infinity，请查看诊断');
 const audio=resample(job.audio,job.rate);diagnostic('resampled-audio',audioStats(audio,16000));
 const speech=hasSpeechEnergy(audio);diagnostic('energy-gate',{hasEnergy:speech,threshold:0.003,note:'静音能量门，不是神经VAD'});
 if(!speech)return {text:'',chunks:[],silent:true,textFrom:'silence'};
 const options={task:'transcribe',language,return_timestamps:true,chunk_length_s:20,stride_length_s:3,condition_on_prev_tokens:false,max_new_tokens:192,num_beams:1};
 diagnostic('inference-start',{options});const before=performance.now();
 const raw=await recognizer(audio,options);
 diagnostic('inference-raw-result',{milliseconds:performance.now()-before,raw:describeRaw(raw)});
 const result=normalizeAsrResult(raw);diagnostic('normalized-result',{text:result.text.slice(0,4000),textFrom:result.textFrom,chunks:result.chunks.length});return result;
}
