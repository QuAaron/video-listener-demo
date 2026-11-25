import { mkdir, readdir, copyFile } from 'node:fs/promises';
const dir='node_modules/onnxruntime-web/dist';
await mkdir('public/ort',{recursive:true});
for(const f of await readdir(dir)) if(f.endsWith('.wasm') || f.startsWith('ort-wasm') && f.endsWith('.mjs')) await copyFile(`${dir}/${f}`,`public/ort/${f}`);
console.log('ONNX WASM运行文件已复制到 public/ort（本机服务，无第三方运行时CDN）');
