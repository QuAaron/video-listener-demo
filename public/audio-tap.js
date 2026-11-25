// AudioWorklet: digital tab audio only; no getUserMedia/microphone anywhere.
class AudioTap extends AudioWorkletProcessor {
 constructor(){super();this.samples=new Float32Array(2048);this.used=0;this.stopped=false;this.port.onmessage=({data})=>{if(data==='flush'){this.stopped=true;if(this.used){const a=this.samples.slice(0,this.used);this.port.postMessage(a,[a.buffer]);this.used=0;}this.port.postMessage({flushed:true});}};}
 process(inputs,outputs){
  const input=inputs[0];
  if(!this.stopped&&input?.length){for(let i=0;i<input[0].length;i++){
   let v=0;for(const c of input)v+=c[i]/input.length;this.samples[this.used++]=v;
   if(this.used===this.samples.length){this.port.postMessage(this.samples,[this.samples.buffer]);this.samples=new Float32Array(2048);this.used=0;}
  }}
  // Keep the audio graph running without echoing the captured tab audio.
  for(const output of outputs)for(const c of output)c.fill(0);
  return true;
 }
}
registerProcessor('audio-tap',AudioTap);
