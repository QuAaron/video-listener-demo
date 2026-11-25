import {expect,it} from 'vitest';
import {PlaybackEndDetector} from '../src/playback-end';
function quiet(detector:PlaybackEndDetector,start:number,end:number){
 let result;
 for(let t=start;t<=end;t++)result=detector.probe(t,false,true);
 return result;
}
it('requires prior audio, sixty seconds of inactivity and a full countdown',()=>{
 const d=new PlaybackEndDetector();
 expect(quiet(d,0,100)).toBeUndefined();
 d.audio(100);
 expect(quiet(d,101,159)).toBeUndefined();
 expect(quiet(d,160,160)).toBe(15);
 expect(quiet(d,161,175)).toBe(0);
});
it('resets on audio, picture change, keep-going, missing observations or unhealthy capture',()=>{
 for(const reset of ['audio','change','button','gap','unhealthy']){
  const d=new PlaybackEndDetector();d.audio(0);expect(quiet(d,0,65)).toBe(10);
  const t=reset==='gap'?90:66;
  if(reset==='button')d.keepGoing(t);
  if(reset==='audio')d.audio(t);
  expect(d.probe(t,reset==='change',reset!=='unhealthy')).toBeUndefined();
  expect(quiet(d,t+1,t+59)).toBeUndefined();
 }
});
