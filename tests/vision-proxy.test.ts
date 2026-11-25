/** Mock protocol-only tests, not real-model quality evidence. Real evidence is vision-smoke.json. */
import {it,expect,afterEach,vi} from 'vitest';
import {createServer,request as httpRequest,type Server} from 'node:http';
import {visionMiddleware} from '../server/vision-proxy';
import {VISION_MODEL} from '../src/vision-core';
let server:Server|undefined;
afterEach(async()=>{vi.unstubAllGlobals();if(server)await new Promise<void>(r=>server!.close(()=>r()));server=undefined;});
async function call(path:string,body:unknown,origin=true){server=createServer((req,res)=>visionMiddleware(req,res,()=>{res.writeHead(404);res.end();}));await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));const port=(server.address() as any).port;return new Promise<{status:number;body:any}>((resolve,reject)=>{const req=httpRequest({hostname:'127.0.0.1',port,path,method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:`http://127.0.0.1:${port}`}:{})}},res=>{let out='';res.on('data',x=>out+=x);res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(out)}));});req.on('error',reject);req.end(JSON.stringify(body));});}
const job={window:{id:'test',key:'test',start:0,end:30,frames:[{id:1,time:15}],transcript:'synthetic test',warnings:[]},images:['YWJj']};
const result={readability:'readable',speakerClaims:[],chartObservations:['synthetic line'],jointSummary:'unit fixture only',conflicts:[],uncertainties:[]};
it('transports actual base64 as OpenAI typed image_url blocks, not ignored Ollama images property',async()=>{
 const fetcher=vi.fn(async(_url:any,init:any)=>{const p=JSON.parse(init.body);expect(String(_url)).toBe('http://127.0.0.1:11437/v1/chat/completions');expect(p.model).toBe(VISION_MODEL);expect(p.messages[1].content).toContainEqual({type:'image_url',image_url:{url:'data:image/jpeg;base64,YWJj'}});expect(p.messages[1].images).toBeUndefined();expect(p.stream).toBe(false);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}]}));});vi.stubGlobal('fetch',fetcher);
 const r=await call('/api/local-vision/analyze',job);expect(r.status).toBe(200);expect(r.body.content.chartObservations).toEqual(['synthetic line']);expect(r.body.metrics.inputImages).toBe(1);expect(fetcher).toHaveBeenCalledOnce();
});
it('does not contact local model for non-consensual cross-origin POST',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);const r=await call('/api/local-vision/analyze',job,false);expect(r.status).toBe(403);expect(f).not.toHaveBeenCalled();});
it('rejects missing image data and evidence time outside window before inference',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);const r=await call('/api/local-vision/analyze',{...job,images:[]});expect(r.status).not.toBe(200);expect(f).not.toHaveBeenCalled();});
it('does not claim success if backend returns empty text',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:''},finish_reason:'stop'}]}))));const r=await call('/api/local-vision/analyze',job);expect(r.status).toBe(502);expect(r.body.error).toContain('没有返回文字');});
it('does not claim complete if token budget truncated JSON output',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)},finish_reason:'length'}]}))));const r=await call('/api/local-vision/analyze',job);expect(r.status).toBe(502);expect(r.body.error).toContain('token上限');});
