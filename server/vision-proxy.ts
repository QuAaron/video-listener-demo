import type {IncomingMessage,ServerResponse} from 'node:http';
import {VISION_MODEL,VISION_BUDGET,VISION_SCHEMA,OVERVIEW_SCHEMA,windowMessages,overviewMessages,parseVision,parseOverview} from '../src/vision-core';
// Dedicated local-only model service; deliberately not a configurable remote proxy.
const UPSTREAM='http://127.0.0.1:11437';let active=false;
export function visionMiddleware(req:IncomingMessage,res:ServerResponse,next:()=>void){
 if(!req.url?.startsWith('/api/local-vision/'))return next();
 const path=req.url.split('?')[0];const reply=(status:number,data:unknown)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
 const host=req.headers.host??'';
 if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host))return reply(403,{error:'只接受本机localhost访问'});
 if(req.method==='POST'&&(req.headers.origin!==`http://${host}`||req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'))return reply(403,{error:'仅接受本机同源JSON请求'});
 if(!['/api/local-vision/health','/api/local-vision/analyze','/api/local-vision/unload'].includes(path))return reply(404,{error:'未知接口'});
 if(path.endsWith('/health')?req.method!=='GET':req.method!=='POST')return reply(405,{error:'请求方法不支持'});
 if(active)return reply(409,{error:'本地视觉模型正在处理另一个请求；请等待或取消'});
 active=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),VISION_BUDGET.timeoutMs);
 req.on('aborted',()=>controller.abort());res.on('close',()=>controller.abort());
 const invoke=async(endpoint:string,body:unknown)=>{const r=await fetch(UPSTREAM+endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const text=await r.text();if(!r.ok)throw Error(`llama.cpp ${r.status}: ${text.slice(0,600)}`);return JSON.parse(text);};
 void(async()=>{try{
  if(path.endsWith('/health')){const r=await fetch(UPSTREAM+'/props',{redirect:'error',signal:controller.signal});if(!r.ok)throw Error(`llama.cpp ${r.status}`);const show=await r.json();if(show.model_alias!==VISION_MODEL)throw Error('服务模型别名不匹配，请使用本Demo启动脚本');if(!show.modalities?.vision)throw Error('服务未报告视觉编码器能力');reply(200,{ready:true,model:VISION_MODEL,upstream:UPSTREAM,capabilities:['text','vision']});return;}
  let size=0;const parts:Buffer[]=[];for await(const part of req){size+=part.length;if(size>3_000_000)throw Error('请求超过3MB硬预算');parts.push(Buffer.from(part));}const input=JSON.parse(Buffer.concat(parts).toString());
  if(path.endsWith('/unload')){reply(200,{released:false,note:'llama.cpp服务由启动终端管理，模型常驻；关闭该终端或Ctrl-C释放内存。'});return;}
  let messages:unknown,format:unknown;
  if(path.endsWith('/analyze')){
   const w=input.window,images=input.images;
   if(!w||!Array.isArray(w.frames)||w.frames.length<1||w.frames.length>2||!Array.isArray(images)||images.length!==w.frames.length||images.some((x:unknown)=>typeof x!=='string'||x.length>1_300_000||!/^[A-Za-z0-9+/=]+$/.test(x)))throw Error('无效图片/帧预算（每窗1–2帧）');
   if(typeof w.transcript!=='string'||w.transcript.length>1800||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<w.start||w.end-w.start>30.01||!Array.isArray(w.warnings)||w.warnings.length>12)throw Error('无效时间窗/转写预算');
   for(const f of w.frames)if(!Number.isFinite(f.id)||!Number.isFinite(f.time)||f.time<w.start||f.time>w.end)throw Error('帧时间不在窗口内');
   messages=windowMessages(w,images);format=VISION_SCHEMA;
  }else{
   if(!Array.isArray(input.results)||input.results.length<1||input.results.length>8||typeof input.coverage!=='string'||input.coverage.length>1000)throw Error('全段汇总预算无效');
   messages=overviewMessages(input.results,input.coverage);format=OVERVIEW_SCHEMA;
  }
  // OpenAI-compatible API requires typed image_url content. An Ollama-style images field would be silently ignored.
  const openAiMessages=(messages as Array<{role:string;content:string;images?:string[]}>).map(m=>({role:m.role,content:m.images?[{type:'text',text:m.content},...m.images.map(image=>({type:'image_url',image_url:{url:`data:image/jpeg;base64,${image}`}}))]:m.content}));
  active=true;const started=performance.now();const raw=await invoke('/v1/chat/completions',{model:VISION_MODEL,messages:openAiMessages,response_format:{type:'json_schema',json_schema:{name:'vision_analysis',strict:true,schema:format}},stream:false,temperature:0,max_tokens:VISION_BUDGET.maxOutputTokens,seed:42,chat_template_kwargs:{enable_thinking:false}});
  const text=raw.choices?.[0]?.message?.content;let content;try{content=path.endsWith('/analyze')?parseVision(text):parseOverview(text);}catch(e){return reply(502,{error:String(e),rawText:typeof text==='string'?text.slice(0,6000):'',doneReason:raw.choices?.[0]?.finish_reason});}
  if(raw.choices?.[0]?.finish_reason==='length')return reply(502,{error:'达到输出token上限，结果可能截断，未计入完成',rawText:text.slice(0,6000)});
  reply(200,{content,model:VISION_MODEL,milliseconds:performance.now()-started,rawText:text,metrics:{timings:raw.timings,usage:raw.usage,inputImages:path.endsWith('/analyze')?input.images.length:0},warnings:['本机2B量化模型输出未经人工核验，不构成投资建议。']});
 }catch(e){reply(502,{error:`本地视觉服务失败：${e instanceof Error?e.message:String(e)}。请确认专用llama.cpp服务在127.0.0.1:11437、模型已下载；不会切换云端。`});}finally{active=false;clearTimeout(timer);}})();
}
