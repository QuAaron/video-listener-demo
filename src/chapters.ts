import {strToU8, zipSync} from 'fflate';
import {formatTime, type Transcript} from './core';

export const MAX_DURATION = 120 * 60;
export function fileStem(name: string) {
  const clean = name.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const stem = Array.from(clean).slice(0, 54).join('').replace(/[. ]+$/, '');
  return stem && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(stem) ? stem : '视频笔记';
}

export function chapterSummary(lines: Transcript[]) {
  const sentences = [...new Set(lines.flatMap(line => line.text.match(/[^。！？.!?]+[。！？.!?]*/gu) ?? [])
    .map(s => s.trim()).filter(Boolean))];
  if (!sentences.length) return '本段没有已识别的讲解。';
  // Rank sentences within thirds so repeated terms near the opening cannot hide later topics.
  const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]{2}/gu) ?? [];
  const freq = new Map<string, number>();
  for (const s of sentences) for (const word of new Set(tokens(s))) freq.set(word, (freq.get(word) ?? 0) + 1);
  const score = (s: string) => {
    const words = tokens(s);
    return words.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0) / Math.sqrt(Math.max(1, words.length));
  };
  const count = Math.min(3, sentences.length);
  return Array.from({length: count}, (_, i) => sentences.slice(Math.floor(i*sentences.length/count), Math.floor((i+1)*sentences.length/count))
    .reduce((best, s) => score(s) > score(best) ? s : best)).join('\n');
}

export function changedScene(previous: Uint8ClampedArray | undefined, current: Uint8ClampedArray) {
  if (!previous || previous.length !== current.length) return true;
  let changed = 0;
  for (let i=0; i<current.length; i+=4) {
    const delta = Math.abs(previous[i]-current[i])+Math.abs(previous[i+1]-current[i+1])+Math.abs(previous[i+2]-current[i+2]);
    if (delta >= 66) changed++;
  }
  return changed >= current.length / 4 * 0.055;
}

export type ChapterInfo = {id:string; title:string; session:string; part:number; start:number; end:number; summary:string; frameCount:number};
type ChapterFrame = {time:number; blob:Blob};
export async function chapterZip(info:ChapterInfo, lines:Transcript[], frames:ChapterFrame[]) {
  const index = frames.map((f,i)=>({time:f.time,file:'frames/'+(i+1)+'.jpg'}));
  const notes = info.title+'\n'+formatTime(info.start)+' — '+formatTime(info.end)+'\n\n转写摘录摘要\n'+info.summary+'\n\n'+lines.map(t=>'['+formatTime(t.start)+'] '+t.text).join('\n');
  const files:Record<string,Uint8Array> = {'notes.txt':strToU8(notes),'chapter.json':strToU8(JSON.stringify({...info,summaryMethod:'extractive-transcript',timeBasis:'session-elapsed',transcripts:lines,frames:index},null,2))};
  await Promise.all(frames.map(async(f,i)=>{ files[index[i].file]=new Uint8Array(await f.blob.arrayBuffer()); }));
  return new Blob([zipSync(files,{level:0}) as BlobPart],{type:'application/zip'});
}

let database:Promise<IDBDatabase>|undefined;
function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open('video-listener-chapters',1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('chapters',{keyPath:'id'});req.result.createObjectStore('archives');};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  }).catch(err=>{database=undefined;throw err;});
  return database;
}
export async function storeChapter(info:ChapterInfo, archive:Blob) {
  const db=await openDatabase();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['chapters','archives'],'readwrite');
    tx.objectStore('chapters').put(info);
    tx.objectStore('archives').put(archive,info.id);
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
  });
}
export async function readChapters():Promise<ChapterInfo[]> {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const req=db.transaction('chapters').objectStore('chapters').getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
export async function readArchive(id:string):Promise<Blob> {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const req=db.transaction('archives').objectStore('archives').get(id);
    req.onsuccess=()=>req.result ? resolve(req.result) : reject(Error('分段文件不存在'));req.onerror=()=>reject(req.error);
  });
}
export async function removeChapter(id:string) {
  const db=await openDatabase();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['chapters','archives'],'readwrite');
    tx.objectStore('chapters').delete(id);tx.objectStore('archives').delete(id);
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
  });
}
