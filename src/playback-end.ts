// The source player lives in another tab. Observe its captured audio and video.
export class PlaybackEndDetector {
 private heardAudio=false;
 private lastActivity=0;
 private lastProbe:number|undefined;
 private deadline:number|undefined;

 audio(now:number){
  this.heardAudio=true;
  this.keepGoing(now);
 }

 keepGoing(now:number){
  this.lastActivity=now;
  this.deadline=undefined;
 }

 probe(now:number, changed:boolean, healthy:boolean):number|undefined {
  if(this.lastProbe===undefined||now-this.lastProbe>6||changed||!healthy)this.keepGoing(now);
  this.lastProbe=now;
  if(!this.heardAudio||now-this.lastActivity<60)return;
  this.deadline??=now+15;
  return Math.max(0,Math.ceil(this.deadline-now));
 }
}
