import { defineConfig } from 'vite';
import {visionMiddleware} from './server/vision-proxy';
const headers={'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'none'; object-src 'none'",'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless'};
export default defineConfig({plugins:[{name:'local-only-vision',configureServer(server){server.middlewares.use(visionMiddleware);},configurePreviewServer(server){server.middlewares.use(visionMiddleware);}}],worker:{format:'es'},server:{headers},preview:{headers},build:{target:'es2022',outDir:'dist'}});
