import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// Actual profile/runtime, synthetic device and HTTP only. Never asks for real GPS.
const source = `
import React,{useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Profile from './src/app/tech/profile/page';
import {GpsStatusProvider,useGpsStatus} from './src/components/tech/GpsStatusContext';
import {startGpsRuntime} from './src/lib/tech-gps-runtime';
function Device(){
 const {update}=useGpsStatus();
 useEffect(()=>{
  let broken=true, allowed=true, callback;
  const permission=Object.assign(new EventTarget(),{state:'granted'});
  const fix=()=>({coords:{latitude:37,longitude:-93,accuracy:12,speed:null,heading:null},timestamp:Date.now()});
  const emit=fn=>queueMicrotask(()=>fn(fix()));
  const geo={watchPosition(fn){callback=fn;emit(fn);return 1},clearWatch(){callback=null},getCurrentPosition(fn){emit(fn)}};
  const stop=startGpsRuntime({navigator:{geolocation:geo,permissions:{query:async()=>permission},onLine:true},document,window,update,
   fetch:async(url,init)=>{if(init?.method==='POST'){return Response.json({point:JSON.parse(init.body)},{status:broken?503:201})} return Response.json({trackingAllowed:allowed})}
  });
  const recover=()=>{broken=false;window.dispatchEvent(new Event('hearth-gps-retry'))};
  const deny=()=>{permission.state='denied';permission.dispatchEvent(new Event('change'))};
  const grant=()=>{permission.state='granted';permission.dispatchEvent(new Event('change'))};
  document.getElementById('recover').onclick=recover;
  document.getElementById('deny').onclick=deny;
  document.getElementById('grant').onclick=grant;
  return stop;
 },[update]);return null;
}
createRoot(document.getElementById('root')).render(<GpsStatusProvider><Device/><Profile/></GpsStatusProvider>);
`;
const mocks = {
  '@clerk/nextjs': `export const useUser=()=>({isLoaded:true,user:{id:'fixture',fullName:'Test Technician',primaryEmailAddress:{emailAddress:'test@example.invalid'}}});export const useClerk=()=>({signOut:async()=>{}});`,
  'next/navigation': `export const useRouter=()=>({push:()=>{}});export const usePathname=()=>'/tech/profile';`,
  'next/link': `import React from 'react';export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>}`,
};
const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'gps-fixture', setup(b) {
    b.onResolve({ filter: /^(@clerk\/nextjs|next\/(navigation|link))$/ }, args => ({ path: args.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: process.cwd() }));
  } }],
});
const css = (await postcss([tailwind()]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css + '\n:root{--font-geist-sans:Arial,sans-serif;--font-geist-mono:monospace}';
const server = createServer((req, res) => {
  const send = (type, body, status = 200) => { res.writeHead(status, { 'Content-Type': type }); res.end(body); };
  if (req.url === '/app.js') return send('text/javascript', bundle.outputFiles[0].text);
  if (req.url === '/app.css') return send('text/css', css);
  if (req.url === '/api/tech/me') return send('application/json', JSON.stringify({
    tech: { id: 'fixture', name: 'Test Technician', email: 'test@example.invalid' },
    clockEntry: { clockInAt: new Date(Date.now() - 3600000).toISOString() }, stats: {}, isOwner: false,
  }));
  if (req.url?.startsWith('/api/')) return send('application/json', '{"error":"Disabled in offline fixture"}', 403);
  send('text/html', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><nav style="padding:8px;display:flex;gap:12px;flex-wrap:wrap;background:#fff;color:#111"><span>Synthetic GPS test</span><button id="recover">Restore connection</button><button id="deny">Block GPS</button><button id="grant">Allow GPS</button></nav><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
console.log(`Synthetic GPS profile: http://127.0.0.1:${server.address().port}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.closeAllConnections(); server.close(); });
