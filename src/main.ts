import {PlaybackEndDetector} from './playback-end';
import {MAX_DURATION,fileStem,changedScene,chapterSummary,chapterZip,storeChapter,readChapters,readArchive,removeChapter,type ChapterInfo} from './chapters';
import {mountVision} from './vision-ui';
import './style.css';
import {unwrapTranscriptionMessage,completionOutcome,audioStats,type AsrResult} from './protocol';
import {zipSync,strToU8} from 'fflate';
import {MODELS,Chunker,SerialQueue,Lifecycle,TIME_BASIS,hasSpeechEnergy,formatTime,dedupeBoundary,downmix,type AudioJob,type Transcript,type ModelKey} from './core';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
$('app').innerHTML=`
<header><div class="brand">◈ 听见 · 看见</div><span class="pill">LOCAL FIRST · 版本 0.2.0</span></header>
<main>
 <div class="intro"><div><span class="eyebrow">VIDEO LEARNING WORKSPACE</span><h1>让无字幕视频，留下可回看的笔记。</h1><p>直接听标签页的声音，留住关键画面。不抓字幕，不调用云端识别。</p></div></div>
 <div class="grid">
  <section class="card"><h2>01 / 准备本地识别</h2>
   <div class="field"><label for="model">多语言 Whisper 模型</label><select id="model"><option value="tiny">Tiny · 轻量试跑（约 40–50 MB 下载量级）</option><option value="base">Base · 稍强一些（约 80–90 MB 下载量级）</option></select><p class="hint">量化 q8；加载时内存高于文件大小。请手动选择主要语言；实际下载以文件为准。不是 large-v3；中文技术词、中英混杂仍可能出错。</p></div>
   <div class="field"><label for="language">主要语言</label><select id="language"><option value="chinese">中文（含少量英文术语）</option><option value="english">英语</option></select></div>
   <div class="field"><label for="backend">运行后端</label><select id="backend"><option value="auto">自动 · WebGPU 优先，失败转 WASM</option><option value="wasm">WASM · 更兼容，可能较慢</option></select></div>
   <button id="load" class="primary">加载识别模型</button><p id="download-text" class="hint">首次加载需要联网下载模型；缓存可能被浏览器清理。</p><progress id="download" max="100" value="0" hidden aria-label="当前模型文件下载进度"></progress>
   <h2 style="margin-top:24px">02 / 选择视频标签页</h2><ol class="steps"><li>先加载模型，再点击「开始共享」。</li><li>用 Chrome / Edge 选择<strong>目标视频标签页</strong>，勾选<strong>共享标签页音频</strong>。</li><li>回到视频播放；积压时先暂停视频，等待识别。</li></ol>
   <div class="field"><label for="period">自动保存分段</label><select id="period"><option value="12">每 12 分钟</option><option value="10">每 10 分钟</option><option value="15">每 15 分钟</option></select></div>
   <div class="field"><label for="interval">画面采样</label><select id="interval"><option value="2">优先保留变化画面</option><option value="0">不保留画面</option></select></div>
   <div class="field"><label for="title-override">视频名称（可选）</label><input id="title-override" maxlength="160" placeholder="默认使用共享源名称，可在共享前填写"></div>
   <div class="actions"><button id="start" class="primary" disabled>开始共享</button><label><input type="checkbox" id="quiet"> 仅转写，自己不听视频</label><button id="stop" disabled>停止并完成队列</button><button id="cancel" class="danger" disabled>取消任务 / 释放模型</button></div>
   <label><input id="detect-end" type="checkbox"> 疑似播完自动停止（连续 60 秒静音且画面静止）</label>
   <div id="end-warning" hidden><span id="end-count" role="status"></span> <button id="keep-going">继续采集</button></div>
   <p class="hint">Mac 共享整个屏幕不保证有声音。只请求屏幕/标签页共享，不请求麦克风。新会话会替换旧结果，请先导出。</p>
   <details class="offline-test"><summary>用本地音频 / 公开样例测试同一识别通道</summary><p>测试不需要屏幕权限。只解码本机文件，不上传；最长 120 秒、最大 20 MB。</p><label for="file">音频文件（WAV / MP3 等浏览器支持格式）</label><input class="file" id="file" type="file" accept="audio/*"><button id="file-run" class="testbtn" disabled>转写所选文件</button><button id="sample" class="testbtn" disabled>运行公开 JFK 英语样例</button><p>公开样例是单独测试，不是实际视频结果。没有预置字幕。音频来自 Hugging Face 文档的公开示例。</p></details>
  </section>
  <section class="card"><div class="statusbar"><span id="state" class="state"><i class="dot"></i>尚未开始</span><span id="device" class="small">模型未加载</span></div>
   <div class="screen"><video id="preview" muted playsinline hidden aria-label="共享内容预览（静音，原标签页继续播放）"></video><div id="placeholder" class="placeholder"><b>▣</b>你选择的视频，会显示在这里<br>只有点击共享后才开始采集</div></div>
   <div class="metrics"><div><span id="clock-label">会话经过时间</span><strong id="clock">00:00.0</strong></div><div><span>待处理音频块</span><strong id="queue">0</strong></div><div><span>保留关键帧</span><strong id="frame-count">0</strong></div></div>
   <div id="alert" class="notice error" role="alert"></div><div id="notice" class="notice" role="status">采集关闭 · 模型不会自行监听你的电脑。</div>
   <div class="notice" id="summary-note"><strong>视觉AI需在下方主动开启并运行。</strong>仅采集截图不等于理解画面；可选专用本机Qwen3.5视觉服务做同时间窗音画联合总结。未运行时不会发送截图。</div>
   <details><summary>时间、内存与隐私边界</summary><p>实时结果使用<strong>本次会话经过时间</strong>，不是 YouTube 播放时间；暂停、拖动和倍速不会自动映射。音频文件测试使用文件相对时间。ASR 时间戳是模型估计，不是逐字对齐。</p><p>最长采集 120 分钟，每段优先保留变化画面（单张最长边 960px）。音频只保留滚动片段和最多 8 块处理队列，不保存全程原声；能量门仅过滤静音，不是神经 VAD。过载会停止采集并明确记录。</p><p>实时分段会把截图、转写和摘录摘要保存到此浏览器的本地存储；主动启用视觉后，选中帧和文字也进入本机Node代理/模型进程内存，不发送云端。刷新后可从“已保存分段”下载；清理网站数据会移除本地存档。模型文件会下载并可能缓存在浏览器。没有遥测、收费接口或隐藏云端识别；模型主机可见模型下载请求，但不接收你的音频。</p><p>后台标签页可能被浏览器节流，导致采帧间隔不稳定。稀疏截图会漏动作、动画和代码修改细节。</p></details>
   <details><summary>会话事件</summary><div id="log"></div></details><details id="diagnostics-panel" open><summary>识别诊断 · 0.2.0 <span id="diagnostic-count">0 条</span></summary><p class="hint">保留最近240条：长度、能量、后端及推理返回结构/文字，不存音频采样。诊断含识别文字；检查后再主动导出。</p><button id="diagnostic-export" class="testbtn">导出诊断 JSON</button><pre id="diagnostics" aria-label="最近识别诊断">等待加载模型或输入音频…</pre></details>
  </section>
 </div>
 <div class="bottom"><section class="card"><div class="sectionhead"><h2>语音转写 <span class="small" id="transcript-count">0 段</span></h2><div class="downloadrow"><label>导出名称 <input id="export-name" maxlength="160" placeholder="视频笔记"></label><button id="txt">TXT</button><button id="json">JSON</button><button id="zip">会话 ZIP（含图片）</button></div></div><div id="transcripts" class="scroll"><div class="empty">还没有识别结果。每块约 12 秒，计算完成后显示。<br>文字是真实 ASR 输出，不是示例字幕。</div></div></section>
 <section class="card"><div class="sectionhead"><h2>画面时间轴</h2><span id="frame-label" class="small">仅采样，未做视觉理解</span></div><div id="frames" class="scroll frames"><div class="empty" style="grid-column:1/-1">共享开始后优先保留变化画面。<br>ZIP 中可导出 JPEG 和时间索引。</div></div></section></div>
 <div class="privacy"><strong>◉ 留在本机</strong><span>不开麦克风 · 不读 YouTube 字幕 · 不上传录音 · 无需 API 密钥。只对你有权处理的内容采集。</span></div>
<section class="card"><h2>已保存分段</h2><p class="hint">每段自动保存到此浏览器，结束时保存尾段。摘要摘自该段转写；ZIP 含摘要、完整转写、时间索引和关键帧。</p><p id="archive-status" role="status"></p><div id="archive-list"></div></section>
<section id="vision-section" class="card"></section>
</main><footer>轻量原型，优先验证采集与识别链路。推荐桌面 Chrome / Edge 和 Node.js 22.12+。<a href="https://huggingface.co/onnx-community/whisper-tiny" target="_blank" rel="noreferrer">模型来源</a> · <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia" target="_blank" rel="noreferrer">共享权限说明</a></footer>`;

const lifecycle=new Lifecycle();
const phaseText={idle:'尚未开始',loading:'正在加载本地模型',ready:'模型就绪 · 等待你选择来源',selecting:'等待共享授权',capturing:'正在采集 · 本地识别',draining:'采集已停止 · 完成剩余识别',done:'本次会话已完成',error:'遇到问题 · 可以重新加载'};
let worker:Worker|undefined,seq=0,token=0;
let pending=new Map<number,{resolve:(r:any)=>void;reject:(e:Error)=>void}>();
let stream:MediaStream|undefined,context:AudioContext|undefined,tap:AudioWorkletNode|undefined,source:MediaStreamAudioSourceNode|undefined,gain:GainNode|undefined;
let chunker:Chunker|undefined,queue:SerialQueue<AudioJob,AsrResult>|undefined;
let started=0,elapsed=0,frameTimer:ReturnType<typeof setInterval>|undefined,clockTimer:ReturnType<typeof setInterval>|undefined;
let capturedEnd=0,processedEnd=0,frameBusy=false;
let diagnostics:Array<Record<string,unknown>>=[];let sessionStats={queued:0,completed:0,failed:0,silent:0,withText:0,duplicates:0};
let transcripts:Transcript[]=[],frames:Array<{time:number;blob:Blob;url:string}>=[],events:Array<{time:number;message:string}>=[];
let sessionKind:'live'|'file'|'public-test'|'synthetic-test'='live',sessionName='',modelKey:ModelKey='tiny',language='chinese',actualDevice='',createdAt='';
let loadedModel:ModelKey='tiny',sessionModel:ModelKey='tiny';let sessionLanguage='chinese',sessionBackend='';
let visionUI:ReturnType<typeof mountVision>|undefined;
const preview=$<HTMLVideoElement>('preview');
const btn=(id:string)=>$<HTMLButtonElement>(id);
const val=(id:string)=>$<HTMLSelectElement>(id).value;
function notice(text:string,warn=false){$('notice').textContent=text;$('notice').className=`notice${warn?' warn':''}`;}
function error(e:unknown){$('alert').textContent=e instanceof Error?e.message:String(e);}
function diagnostic(entry:Record<string,unknown>){diagnostics.push({at:new Date().toISOString(),sessionElapsed:elapsed,...entry});if(diagnostics.length>240)diagnostics.splice(0,diagnostics.length-240);$('diagnostic-count').textContent=`${diagnostics.length} 条`;$('diagnostics').textContent=diagnostics.slice(-12).map(d=>JSON.stringify(d,null,2)).join('\n');}
function finalStatus(){const outcome=completionOutcome(sessionStats,transcripts.length);notice(outcome.message,!outcome.ok);if(!outcome.ok){$('state').textContent=transcripts.length?'处理结束 · 存在失败，请检查诊断':'处理结束 · 未获得有效文字';error(outcome.message);$('diagnostics-panel').setAttribute('open','');}else $('alert').textContent='';diagnostic({stage:'session-outcome',stats:{...sessionStats},segments:transcripts.length,ok:outcome.ok});}
function event(message:string){events.push({time:elapsed,message});$('log').textContent=events.map(e=>`[${formatTime(e.time)}] ${e.message}`).join('\n');}
function renderState(){const p=lifecycle.phase;$('state').textContent=phaseText[p];$('state').className=`state${p==='capturing'?' active':''}`;
 const ready=p==='ready',locked=['loading','selecting','capturing','draining'].includes(p);
 btn('load').disabled=locked||ready;btn('start').disabled=!ready;btn('stop').disabled=p!=='capturing';btn('cancel').disabled=p==='idle'||p==='done'||p==='error';
 btn('file-run').disabled=!ready;btn('sample').disabled=!ready;
 for(const id of ['model','language','backend','interval','file','period','quiet','detect-end','title-override'])$<HTMLInputElement>(id).disabled=locked||ready&&id==='model';
 updateQueue();visionUI?.updateCounts();
}
function phase(p:Parameters<Lifecycle['set']>[0]){lifecycle.set(p);renderState();}
function rpc(message:object,transfer:Transferable[]=[]){return new Promise<any>((resolve,reject)=>{if(!worker)return reject(Error('识别 Worker 未就绪'));const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({...message,id},transfer);});}
function releaseWorker(){worker?.terminate();worker=undefined;const old=pending;pending=new Map();for(const p of old.values())p.reject(Error('识别已取消，Worker 已释放'));}
let chapterSeconds=720;
let pendingSaves=new Map<number,string>();
let previousPixels:Uint8ClampedArray|undefined;
function clearResults(kind:typeof sessionKind,name:string){for(const f of frames)URL.revokeObjectURL(f.url);transcripts=[];frames=[];events=[];sessionStats={queued:0,completed:0,failed:0,silent:0,withText:0,duplicates:0};diagnostics=diagnostics.filter(d=>String(d.stage).startsWith('model-'));sessionKind=kind;sessionName=name;$<HTMLInputElement>('export-name').value=name;chapterSeconds=Number(val('period'))*60;pendingSaves=new Map();previousPixels=undefined;createdAt=new Date().toISOString();sessionModel=loadedModel;sessionLanguage=language;sessionBackend=actualDevice;elapsed=0;capturedEnd=0;processedEnd=0;$('clock').textContent=formatTime(0);$('clock-label').textContent=kind==='live'?'会话经过时间':'音频文件相对时间';$('alert').textContent='';$('log').textContent='';renderTranscripts();renderFrames();visionUI?.reset();}
function setupQueue(){queue=new SerialQueue<AudioJob,AsrResult>(async job=>{diagnostic({stage:'main-send-job',range:{start:job.start,end:job.end},audio:audioStats(job.audio,job.rate)});const envelope=await rpc({type:'transcribe',job,language},[job.audio.buffer as ArrayBuffer]);diagnostic({stage:'main-worker-envelope',keys:Object.keys(envelope),payloadKeys:envelope.result&&typeof envelope.result==='object'?Object.keys(envelope.result):[],requestId:envelope.id});return unwrapTranscriptionMessage(envelope);},(r,job)=>{
 sessionStats.completed++;diagnostic({stage:'main-accepted-result',text:r.text,textFrom:r.textFrom,silent:r.silent,range:{start:job.start,end:job.end}});
 processedEnd=Math.max(processedEnd,job.end);
 if(r.silent){sessionStats.silent++;event(`${formatTime(job.start)}–${formatTime(job.end)} 静音能量过滤`);return;}
 const previous=transcripts.at(-1);const overlap=previous&&job.start<previous.end;
 const text=overlap?dedupeBoundary(previous.text,r.text??''):(r.text??'').trim();
 if(text.trim()){sessionStats.withText++;
 // Chunk range is stable. Native timestamps are advisory; use them only when valid.
 const chunks=r.chunks as Array<{timestamp:[number|null,number|null]}>|undefined;
 const a=chunks?.[0]?.timestamp?.[0],b=chunks?.at(-1)?.timestamp?.[1];const duration=job.end-job.start;const valid=typeof a==='number'&&typeof b==='number'&&a>=0&&b>=a&&b<=duration+0.1;
 transcripts.push({start:valid?job.start+a:job.start,end:valid?Math.min(job.end,job.start+b):job.end,text:text.trim()});renderTranscripts();
 }else{sessionStats.duplicates++;diagnostic({stage:'boundary-dedup-empty',rawText:r.text});}
 },e=>{sessionStats.failed++;diagnostic({stage:'main-job-error',message:e instanceof Error?e.message:String(e)});error(e);event('识别失败，已停止继续采集；失败音频块未生成文本。');if(lifecycle.phase==='capturing')void finish();},updateQueue,8);}
function updateQueue(){if(!$('queue'))return;$('queue').textContent=String(queue?.size??0);
 if(lifecycle.phase==='capturing'){
  const lag=Math.max(0,capturedEnd-processedEnd);notice(queue&&queue.size>=3?`识别积压约 ${Math.round(lag)} 秒，请先暂停视频。音频仍在采集；达到上限会自动停止。`:'正在接收数字音频。无需外放声音；每块计算完成后显示结果。',!!queue&&queue.size>=3);
 }
}
function enqueue(job:AudioJob){sessionStats.queued++;capturedEnd=Math.max(capturedEnd,job.end);if(!queue?.add(job)){sessionStats.failed++;error('处理队列已满；该片段未入队，已停止采集。请导出结果后用较小模型重试。');event(`丢失片段 ${formatTime(job.start)}–${formatTime(job.end)}：队列已满`);void finish();}else if(queue.size>=6&&lifecycle.phase==='capturing'){event('达到积压保护阈值，自动停止采集并处理队列。');notice('识别速度落后，已自动停止采集。请暂停视频，等待队列完成。',true);void finish();}}
function renderTranscripts(){visionUI?.updateCounts();const root=$('transcripts');$('transcript-count').textContent=`${transcripts.length} 段`;
 if(!transcripts.length){root.innerHTML='<div class="empty">暂无转写结果。请等待音频块计算完成。<br>静音、模型加载或空输入都不会生成假字幕。</div>';return;}
 const nodes=transcripts.map(t=>{const div=document.createElement('div');div.className='segment';const time=document.createElement('time');time.textContent=`${formatTime(t.start)}\n— ${formatTime(t.end)}`;const p=document.createElement('p');p.textContent=t.text;div.append(time,p);return div;});root.replaceChildren(...nodes);
}
let drawnFrames=0;
function renderFrames(){visionUI?.updateCounts();const root=$('frames');$('frame-count').textContent=String(frames.length);if(!frames.length){drawnFrames=0;root.innerHTML='<div class="empty" style="grid-column:1/-1">暂无截图。只有实时共享会采样画面。</div>';return;}
 if(!drawnFrames)root.replaceChildren();
 root.append(...frames.slice(drawnFrames).map(f=>{const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=f.url;img.alt=`会话经过 ${formatTime(f.time)} 的视频画面，未做AI理解`;img.loading='lazy';img.width=480;img.height=270;caption.textContent=`会话 ${formatTime(f.time)}`;figure.append(img,caption);return figure;}));drawnFrames=frames.length;
}
async function load(){if(['loading','selecting','capturing','draining','ready'].includes(lifecycle.phase))return;
 const own=++token;releaseWorker();phase('loading');$('alert').textContent='';modelKey=val('model') as ModelKey;language=val('language');loadedModel=modelKey;
 const progress=$<HTMLProgressElement>('download');progress.hidden=false;progress.removeAttribute('value');$('download-text').textContent='检查本机后端，随后下载/读取缓存…';
 try{
  let device:'webgpu'|'wasm'='wasm';
  if(val('backend')==='auto')try{const gpu=(navigator as any).gpu;const adapter=await gpu?.requestAdapter();if(adapter)device='webgpu';}catch{/* WASM fallback without unsafe feature flags */}
  if(own!==token)return;
  worker=new Worker(new URL('./asr.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=({data:m})=>{
   if(own!==token)return;
   if(m.type==='diagnostic'){diagnostic(m.entry);return;}
   if(m.type==='progress'){const p=m.data;let label=`${p.status??'加载'} ${p.file??''}`;if(typeof p.loaded==='number')label+=` · ${(p.loaded/1048576).toFixed(1)} MB${p.total?` / ${(p.total/1048576).toFixed(1)} MB`:''}`;$('download-text').textContent=label;if(typeof p.progress==='number'){progress.value=p.progress;}else progress.removeAttribute('value');return;}
   if(m.type==='backend'){actualDevice=m.device;if(['capturing','draining'].includes(lifecycle.phase))sessionBackend=actualDevice;$('device').textContent=`Whisper ${modelKey} · q8 · ${actualDevice.toUpperCase()}`;return;}
   if(m.type==='fallback'){notice('WebGPU 初始化失败，正在切换 WASM；不会调用云端。',true);event('WebGPU失败，回退WASM');return;}
   const p=pending.get(m.id);if(p){pending.delete(m.id);m.type==='error'?p.reject(Error(m.message)):p.resolve(m);}
  };
  worker.onerror=e=>{const err=Error(`Worker 运行失败：${e.message}`);diagnostic({stage:'worker-fatal-error',message:e.message});error(err);releaseWorker();if(lifecycle.phase==='capturing')void finish();};
  const result=await rpc({type:'load',model:modelKey,device});if(own!==token)return;actualDevice=result.device;$('device').textContent=`Whisper ${modelKey} · q8 · ${actualDevice.toUpperCase()}`;progress.value=100;progress.hidden=true;$('download-text').textContent=`已加载 ${MODELS[modelKey]}。请先用5–10分钟视频验收准确率。`;phase('ready');notice('模型就绪。请主动选择视频标签页并勾选共享音频。');
 }catch(e){if(own!==token)return;diagnostic({stage:'main-model-load-error',message:e instanceof Error?e.message:String(e)});releaseWorker();progress.hidden=true;phase('error');error(`模型加载失败：${e instanceof Error?e.message:e}。不会改用云端；请检查网络、内存或选择 Tiny/WASM 后重试。`);}
}
const thumbnail=document.createElement('canvas');
thumbnail.width=64;thumbnail.height=36;
let endDetector:PlaybackEndDetector|undefined;
let endPixels:Uint8ClampedArray|undefined;
let nextEndProbe=0;

function readThumbnail(){
 const probe=thumbnail.getContext('2d',{willReadFrequently:true})!;
 probe.drawImage(preview,0,0,64,36);
 return probe.getImageData(0,0,64,36).data;
}

function checkPlaybackEnd(){
 if(!endDetector||elapsed<nextEndProbe||lifecycle.phase!=='capturing')return;
 nextEndProbe=elapsed+1;
 const tracks=stream?.getTracks()??[];
 const healthy=context?.state==='running'&&preview.readyState>=2&&tracks.length>=2&&
  tracks.every(t=>t.enabled&&!t.muted&&t.readyState==='live');
 let changed=false;
 try{
  if(healthy){
   const pixels=readThumbnail();
   changed=changedScene(endPixels,pixels);
   if(changed)endPixels=pixels;
  }
 }catch{endDetector.keepGoing(elapsed);endPixels=undefined;}
 const seconds=endDetector.probe(elapsed,changed,healthy);
 $('end-warning').hidden=seconds===undefined;
 if(seconds===undefined)return;
 $('end-count').textContent='疑似视频已结束，'+seconds+' 秒后停止并保存。';
 if(seconds===0){event('持续静音且画面静止，已自动结束采集。');void finish();}
}
btn('keep-going').onclick=()=>{
 endDetector?.keepGoing((performance.now()-started)/1000);
 $('end-warning').hidden=true;
};
async function sampleFrame(own=token){
 if(frameBusy||lifecycle.phase!=='capturing'||val('interval')==='0'||!preview.videoWidth)return;
 const time=(performance.now()-started)/1000;
 if(time>=MAX_DURATION)return;
 const last=frames.at(-1);
 const newPart=!last||Math.floor(last.time/chapterSeconds)!==Math.floor(time/chapterSeconds);
 if(last&&!newPart&&time-last.time<12)return;
 frameBusy=true;
 try{
  const pixels=readThumbnail();
  if(!newPart&&last&&time-last.time<90&&!changedScene(previousPixels,pixels))return;
  const c=document.createElement('canvas'),scale=Math.min(1,960/Math.max(preview.videoWidth,preview.videoHeight));
  c.width=Math.max(1,Math.round(preview.videoWidth*scale));c.height=Math.max(1,Math.round(preview.videoHeight*scale));
  c.getContext('2d')!.drawImage(preview,0,0,c.width,c.height);
  const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/jpeg',0.72));
  if(blob&&own===token&&lifecycle.phase==='capturing'){
   previousPixels=pixels;frames.push({time,blob,url:URL.createObjectURL(blob)});renderFrames();
  }
 }catch(e){event('采帧失败：'+String(e));}finally{frameBusy=false;}
}
async function start(){if(lifecycle.phase!=='ready')return;language=val('language');
 if(!window.isSecureContext||!navigator.mediaDevices?.getDisplayMedia){error('当前环境不支持安全屏幕共享。请在本机 localhost 使用桌面 Chrome/Edge。');return;}
 phase('selecting');$('alert').textContent='';const own=token;
 try{
 // Must run directly from this user click; no awaited model download before permission prompt.
 const muted=$<HTMLInputElement>('quiet').checked;
 if(muted&&!('suppressLocalAudioPlayback' in navigator.mediaDevices.getSupportedConstraints()))throw Error('浏览器不支持单独关闭视频声音；请使用桌面 Chrome，或取消静音选项。');
 const chosen=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:{suppressLocalAudioPlayback:muted,echoCancellation:false,noiseSuppression:false,autoGainControl:false},selfBrowserSurface:'exclude',systemAudio:'include',surfaceSwitching:'exclude'} as DisplayMediaStreamOptions);
 if(own!==token){chosen.getTracks().forEach(t=>t.stop());return;}
 if(!chosen.getAudioTracks().length){chosen.getTracks().forEach(t=>t.stop());phase('ready');error('没有收到音轨。请重新选择“视频标签页”，勾选“共享标签页音频”；Mac整个屏幕/窗口可能不提供声音。没有启用麦克风兜底。');return;}
 const audio=chosen.getAudioTracks()[0];
 if(muted&&(audio.getSettings() as MediaTrackSettings & {suppressLocalAudioPlayback?:boolean}).suppressLocalAudioPlayback!==true){
  chosen.getTracks().forEach(t=>t.stop());throw Error('浏览器未确认静音共享，请选择 Chrome 视频标签页并勾选共享标签页音频。');
 }
 const label=chosen.getVideoTracks()[0]?.label.trim()??'';
 const usableLabel=/^(web-contents-media-stream|screen|window|tab)(:|$)/i.test(label)?'':label;
 const title=$<HTMLInputElement>('title-override').value.trim()||usableLabel||'视频笔记';
 clearResults('live',title);event('导出名称：'+title);stream=chosen;started=performance.now();setupQueue();
 preview.srcObject=stream;preview.hidden=false;$('placeholder').hidden=true;
 for(const track of stream.getTracks())track.onended=()=>{if(lifecycle.phase==='capturing'){event('用户或浏览器停止了共享。');void finish();}};
 await preview.play();if(own!==token)return;
 context=new AudioContext();await context.resume();await context.audioWorklet.addModule('/audio-tap.js');if(own!==token)return;
 if(stream.getTracks().some(t=>t.readyState==='ended'))throw Error('共享在初始化期间已停止，请重新开始。');
 source=context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));tap=new AudioWorkletNode(context,'audio-tap');gain=context.createGain();gain.gain.value=0;
 chunker=new Chunker(context.sampleRate,12,1,(performance.now()-started)/1000);
 endDetector=$<HTMLInputElement>('detect-end').checked?new PlaybackEndDetector():undefined;endPixels=undefined;nextEndProbe=0;
 tap.port.onmessage=({data})=>{if(data?.flushed)return;if(own!==token||!chunker)return;if(endDetector&&hasSpeechEnergy(data,0.001)){endDetector.audio((performance.now()-started)/1000);$('end-warning').hidden=true;}for(const j of chunker.push(data as Float32Array))enqueue(j);};
 source.connect(tap);tap.connect(gain);gain.connect(context.destination);phase('capturing');event(`数字音频 ${context.sampleRate}Hz，Worker内低通重采样至16000Hz；使用会话时间。`);
 const seconds=Number(val('interval'));if(seconds){await sampleFrame(own);frameTimer=setInterval(()=>void sampleFrame(own),seconds*1000);}
 clockTimer=setInterval(()=>{elapsed=(performance.now()-started)/1000;$('clock').textContent=formatTime(elapsed);checkPlaybackEnd();if(elapsed>=chapterSeconds) scheduleChapters(false);if(elapsed>=MAX_DURATION){event('达到120分钟上限，自动停止。');void finish();}},250);
 }catch(e){if(own!==token)return;await cleanupCapture(false);if((lifecycle.phase as string)==='selecting')phase('ready');else if((lifecycle.phase as string)==='capturing')phase('error');error(e instanceof DOMException&&e.name==='NotAllowedError'?'共享被拒绝或取消。未采集任何麦克风音频；你可以重新点击开始。':`共享启动失败：${String(e)}`);}
}
async function cleanupCapture(flush:boolean){
 // Snapshot ownership BEFORE awaiting: an old cleanup must never close a newer session.
 endDetector=undefined;endPixels=undefined;$('end-warning').hidden=true;
 clearInterval(frameTimer);clearInterval(clockTimer);frameTimer=clockTimer=undefined;
 const s=stream,node=tap,src=source,g=gain,c=context;
 stream=undefined;tap=undefined;source=undefined;gain=undefined;context=undefined;
 if(s)for(const t of s.getTracks()){t.onended=null;t.stop();}
 preview.pause();preview.srcObject=null;preview.hidden=true;$('placeholder').hidden=false;
 if(flush&&node){await new Promise<void>(resolve=>{
  const original=node.port.onmessage;const timeout=setTimeout(resolve,300);
  node.port.onmessage=e=>{if(e.data?.flushed){clearTimeout(timeout);resolve();}else original?.call(node.port,e);};
  node.port.postMessage('flush');
 });}
 if(node){node.port.onmessage=null;node.port.close();node.disconnect();}src?.disconnect();g?.disconnect();
 if(c&&c.state!=='closed')await c.close();
}
async function finish(){if(lifecycle.phase!=='capturing')return;phase('draining');const own=token;elapsed=(performance.now()-started)/1000;await cleanupCapture(true);if(own!==token)return;const tail=chunker?.flush();chunker=undefined;if(tail)enqueue(tail);await queue?.drain();if(own!==token)return;elapsed=Math.min(MAX_DURATION,Math.max(elapsed,processedEnd));await scheduleChapters(true);if(own!==token)return;releaseWorker();phase('done');event('采集资源和推理Worker均已释放。');finalStatus();}
async function cancel(){const saveTail=lifecycle.phase==='capturing'||lifecycle.phase==='draining'&&sessionKind==='live';if(saveTail){elapsed=Math.min(MAX_DURATION,(performance.now()-started)/1000);void scheduleChapters(true);}visionUI?.cancel();const wasSelecting=lifecycle.phase==='selecting';++token;queue?.cancel();releaseWorker();chunker=undefined;await cleanupCapture(false);lifecycle.cancel();renderState();event(wasSelecting?'已取消等待共享；若浏览器选择框仍在，请手动关闭。':'任务已取消；未处理队列已丢弃，已完成文本与截图仍可导出。');notice('任务已取消并释放模型。已完成结果保留在内存，可导出；未完成片段没有转写。',true);$<HTMLProgressElement>('download').hidden=true;}
async function transcribeFile(isPublic=false){if(lifecycle.phase!=='ready')return;language=isPublic?'english':val('language');const file=$<HTMLInputElement>('file').files?.[0];if(!isPublic&&!file){error('请先选择一个音频文件。');return;}if(!isPublic&&file&&file.size>20*1024*1024){error('文件超过20MB，请先剪成120秒内的小片段。');return;}
 phase('draining');const own=token;let decode:AudioContext|undefined;
 try{
  const buf=isPublic?await fetch('/test-jfk.wav',{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw Error('公开样例文件不存在或加载失败');return r.arrayBuffer();}):await file!.arrayBuffer();
  if(own!==token)return;decode=new AudioContext();const audio=await decode.decodeAudioData(buf);if(audio.duration>120)throw Error('音频超过120秒，请先裁剪；本版不在浏览器中解码长文件。');if(own!==token)return;
  clearResults(isPublic?'public-test':'file',isPublic?'公开 JFK 英语测试音频':file!.name);setupQueue();event('本地文件解码测试：与实时采集共用同一Worker/重采样/推理通道，不包含画面。');
  const ch=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i));const mono=downmix(ch);const local=new Chunker(audio.sampleRate);const jobs=local.push(mono);const tail=local.flush();if(tail)jobs.push(tail);
  for(const j of jobs){if(own!==token)return;while(queue!.size>=4){await new Promise(r=>setTimeout(r,100));if(own!==token)return;}enqueue(j);}
  elapsed=audio.duration;$('clock').textContent=formatTime(elapsed);await queue!.drain();if(own!==token)return;releaseWorker();phase('done');finalStatus();event('文件测试结束，推理Worker已释放。');
 }catch(e){if(own===token){queue?.cancel();releaseWorker();phase('error');error(e);}}finally{if(decode&&decode.state!=='closed')await decode.close();}
}
function chapterParts(index:number,end:number) {
 const start=index*chapterSeconds;
 const lines=transcripts.filter(t=>t.start>=start&&t.start<end);
 const images=frames.filter(f=>f.time>=start&&f.time<end);
 return {start,lines,images};
}
function chapterInfo(index:number,end:number,lines:Transcript[],frameCount:number):ChapterInfo {
 return {id:createdAt+'-'+index,title:sessionName,session:createdAt,part:index+1,start:index*chapterSeconds,end,summary:chapterSummary(lines),frameCount};
}
function currentChapters(){
 if(sessionKind!=='live')return [];
 return Array.from({length:Math.ceil(Math.min(MAX_DURATION,elapsed)/chapterSeconds)},(_,i)=>{
  const end=Math.min((i+1)*chapterSeconds,MAX_DURATION,elapsed);
  const {lines,images}=chapterParts(i,end);
  return chapterInfo(i,end,lines,images.length);
 });
}
let saveQueue:Promise<void>=Promise.resolve();
let nextCheck=0;
function scheduleChapters(final:boolean){
 if(!final&&performance.now()<nextCheck)return saveQueue;
 nextCheck=performance.now()+5000;
 const duration=Math.min(MAX_DURATION,elapsed);
 const count=final?Math.ceil(duration/chapterSeconds):Math.floor(duration/chapterSeconds);
 const versions=pendingSaves;
 for(let i=0;i<count;i++){
  const end=Math.min((i+1)*chapterSeconds,duration);
  const {lines,images}=chapterParts(i,end);
  // A late worker response can add text to an already checkpointed chapter.
  const version=[end,lines.length,images.length,sessionName].join('/');
  if(versions.get(i)===version)continue;
  versions.set(i,version);
  const info=chapterInfo(i,end,lines,images.length);
  saveQueue=saveQueue.then(async()=>{
   try{
    const archive=await chapterZip(info,lines,images);
    await storeChapter(info,archive);
    $('archive-status').textContent='已保存 '+info.title+' · 第 '+info.part+' 段';
    await showArchives();
   }catch(e){
    if(versions.get(i)===version)versions.delete(i);
    $('archive-status').textContent='分段保存失败：'+String(e)+'。请及时导出会话 ZIP。';
   }
  });
 }
 return saveQueue;
}
let archiveView=0;
async function showArchives(){
 const version=++archiveView;
 try{
  const all=await readChapters();
  if(version!==archiveView)return;
  all.sort((a,b)=>b.session.localeCompare(a.session)||a.part-b.part);
  const root=$('archive-list');
  root.replaceChildren();
  if(!all.length){root.textContent='暂无已保存分段';return;}
  for(const info of all){
   const item=document.createElement('details'),label=document.createElement('summary'),notes=document.createElement('p');
   label.textContent=info.title+' · 第 '+info.part+' 段 · '+formatTime(info.start)+'–'+formatTime(info.end)+' · '+new Date(info.session).toLocaleString();
   notes.textContent=info.summary;notes.style.whiteSpace='pre-line';
   const save=document.createElement('button'),remove=document.createElement('button');
   save.textContent='下载分段 ZIP';remove.textContent='删除此分段';
   save.onclick=async()=>{try{download(await readArchive(info.id),fileStem(info.title)+'-第'+info.part+'段.zip');}catch(e){error(e);}};
   remove.onclick=async()=>{if(!confirm('删除这份本地分段存档？'))return;try{await removeChapter(info.id);await showArchives();}catch(e){error(e);}};
   item.append(label,notes,save,remove);root.append(item);
  }
 }catch(e){$('archive-status').textContent='无法读取本地分段存档：'+String(e);}
}
void showArchives();
function manifest(){return {schemaVersion:3,appVersion:'0.2.0',createdAt,source:sessionKind,sourceName:sessionName,timeBasis:sessionKind==='live'?TIME_BASIS:'file-relative-seconds',timeNote:'实时采集不是YouTube播放时间；ASR时间是估计，关键帧为采样时刻。',model:sessionKind==='synthetic-test'?null:MODELS[sessionModel],quantization:'q8',backend:sessionBackend,language:sessionLanguage,visualUnderstandingVerified:false,visualInferencePerformed:visionUI?.export().visualInferencePerformed??false,vision:visionUI?.export(),asrPerformed:sessionKind!=='synthetic-test'&&sessionStats.completed>0,rawAudioSaved:false,duration:elapsed,chapters:currentChapters(),transcripts,frames:frames.map((f,i)=>({time:f.time,file:`frames/${String(i+1).padStart(3,'0')}.jpg`})),events,stats:sessionStats,diagnostics};}
$<HTMLInputElement>('export-name').onchange=()=>{
 const name=$<HTMLInputElement>('export-name');
 sessionName=name.value.trim()||sessionName||'视频笔记';name.value=sessionName;
 if(sessionKind==='live'&&createdAt)void scheduleChapters(!['capturing','draining'].includes(lifecycle.phase));
};
function diagnosticExport(){return {appVersion:'0.2.0',generatedAt:new Date().toISOString(),runtime:{userAgent:navigator.userAgent,secureContext:isSecureContext,crossOriginIsolated},source:sessionKind,model:MODELS[sessionModel],backend:sessionBackend,language:sessionLanguage,stats:sessionStats,segments:transcripts.length,diagnostics};}
function textExport(){return `听见·看见 Demo\n来源：${sessionKind} ${sessionName}\n时间基准：${sessionKind==='live'?TIME_BASIS:'file-relative-seconds'}\n模型：${sessionKind==='synthetic-test'?'未运行ASR；讲解为合成测试文字':MODELS[sessionModel]+' q8 '+sessionBackend}\n视觉分析是否完成见文末；ASR与小视觉模型均有误识别风险。\n\n`+transcripts.map(t=>`[${formatTime(t.start)} — ${formatTime(t.end)}] ${t.text}`).join('\n\n');}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
btn('diagnostic-export').onclick=()=>download(new Blob([JSON.stringify(diagnosticExport(),null,2)],{type:'application/json'}),fileStem(sessionName)+'-诊断.json');
btn('load').onclick=()=>void load();btn('start').onclick=()=>void start();btn('stop').onclick=()=>void finish();btn('cancel').onclick=()=>void cancel();btn('file-run').onclick=()=>void transcribeFile();btn('sample').onclick=()=>void transcribeFile(true);
btn('txt').onclick=()=>download(new Blob([fullTextExport()],{type:'text/plain;charset=utf-8'}),fileStem(sessionName)+'.txt');btn('json').onclick=()=>download(new Blob([JSON.stringify(manifest(),null,2)],{type:'application/json'}),fileStem(sessionName)+'.json');
btn('zip').onclick=async()=>{btn('zip').disabled=true;try{const snapshot=manifest(),text=fullTextExport(),saved=frames.slice();const files:Record<string,Uint8Array>={'session.json':strToU8(JSON.stringify(snapshot,null,2)),'diagnostics.json':strToU8(JSON.stringify(diagnosticExport(),null,2)),'transcript.txt':strToU8(text),'vision-summary.json':strToU8(JSON.stringify(visionUI?.export()??null,null,2)),'README.txt':strToU8('本包由用户主动导出。无全程原始音频。画面仅稀疏采样；是否进行真实视觉分析及证据请看vision-summary.json。模型输出可能错误，金融信息不得直接用于交易。实时的时间戳是会话经过时间，不是播放器进度；图帧时间索引见session.json。')};await Promise.all(saved.map(async(f,i)=>{files[`frames/${String(i+1).padStart(3,'0')}.jpg`]=new Uint8Array(await f.blob.arrayBuffer());}));const bytes=zipSync(files,{level:0});download(new Blob([bytes as BlobPart],{type:'application/zip'}),fileStem(snapshot.sourceName)+'.zip');}catch(e){error(e);}finally{btn('zip').disabled=false;}};
window.addEventListener('pagehide',()=>{++token;visionUI?.cancel();queue?.cancel();releaseWorker();void cleanupCapture(false);for(const f of frames)URL.revokeObjectURL(f.url);});
visionUI=mountVision($('vision-section'),()=>({sessionId:createdAt,duration:elapsed,frames:frames.slice(),transcripts:transcripts.slice(),busy:['loading','selecting','capturing','draining'].includes(lifecycle.phase),source:sessionKind,asrFailures:sessionStats.failed}),async id=>{
 const all=await fetch('/vision-fixtures/cases.json').then(r=>r.json());const fixture=all.find((c:any)=>c.id===id);if(!fixture)throw Error('合成测试不存在');
 const blob=await fetch(`/vision-fixtures/${fixture.image}`).then(r=>r.blob());if(!blob.type.startsWith('image/'))throw Error('合成图像加载失败');
 clearResults('synthetic-test',`合成图表测试 ${id}（讲解非ASR）`);sessionBackend='synthetic-fixture-not-asr';elapsed=30;transcripts=[{start:0,end:30,text:fixture.transcript}];frames=[{time:15,blob,url:URL.createObjectURL(blob)}];$('clock').textContent=formatTime(elapsed);$('clock-label').textContent='合成测试相对时间';event('仅载入合成图表与标注的测试讲解，未调用ASR或视觉模型。');renderTranscripts();renderFrames();$('transcript-count').textContent='合成讲解（非ASR）';
});
function fullTextExport(){const v=visionUI?.export();return textExport()+currentChapters().map(c=>'\n\n【第 '+c.part+' 段 · 转写摘录摘要】 '+formatTime(c.start)+' — '+formatTime(c.end)+'\n'+c.summary).join('')+(v?'\n\n【音画联合分析】\n'+JSON.stringify(v,null,2):'');}
renderState();
