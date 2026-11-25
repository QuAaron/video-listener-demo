import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
it('AudioWorklet averages channels, sends full packets, flushes tail and stops accepting input',()=>{
 let Klass:any;const packets:any[]=[];
 class Base {port={onmessage:undefined as any,postMessage:(v:any)=>packets.push(v instanceof Float32Array?v.slice():v)};}
 runInNewContext(readFileSync('public/audio-tap.js','utf8'),{AudioWorkletProcessor:Base,Float32Array,registerProcessor:(_:string,c:any)=>Klass=c});
 const node=new Klass(),left=new Float32Array(128).fill(.6),right=new Float32Array(128).fill(.2),out=new Float32Array(128).fill(1);
 for(let i=0;i<17;i++)node.process([[left,right]],[[out]]);
 expect(packets[0]).toHaveLength(2048);expect(packets[0][0]).toBeCloseTo(.4);expect(out[0]).toBe(0);
 node.port.onmessage({data:'flush'});expect(packets[1]).toHaveLength(128);expect(packets[2]).toEqual({flushed:true});node.process([[left,right]],[[out]]);expect(packets).toHaveLength(3);
});
