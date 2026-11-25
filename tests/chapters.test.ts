import {expect,it} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {changedScene,chapterSummary,chapterZip,fileStem} from '../src/chapters';

it('preserves readable titles and removes filename separators and reserved names',()=>{
 expect(fileStem(' 示例 / A:B?.. ')).toBe('示例 A B');
 expect(fileStem('CON')).toBe('视频笔记');
});
it('detects a new slide while ignoring a single changed pixel',()=>{
 const base=new Uint8ClampedArray(400);
 const next=base.slice();next[0]=255;
 expect(changedScene(base,next)).toBe(false);
 expect(changedScene(base,next.fill(255))).toBe(true);
 expect(changedScene(undefined,base)).toBe(true);
});
it('stores readable summaries and indexed images in a standalone chapter',async()=>{
 const lines=[{start:720,end:724,text:'这一段讲音频分块。下一步讨论采样。'}];
 const summary=chapterSummary(lines);
 const archive=await chapterZip({id:'s-1',part:2,title:'课程',session:'s',start:720,end:727,summary,frameCount:1},lines,[{time:724,blob:new Blob(['example'])}]);
 const files=unzipSync(new Uint8Array(await archive.arrayBuffer()));
 const saved=JSON.parse(strFromU8(files['chapter.json']));
 expect(saved.transcripts).toEqual(lines);
 expect(saved.summary).toContain('音频分块');
 expect(strFromU8(files[saved.frames[0].file])).toBe('example');
 expect(strFromU8(files['notes.txt'])).toContain('12:00');
 expect(chapterSummary([])).toContain('没有');
});
