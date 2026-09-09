import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const require = createRequire(import.meta.url);
const serve = process.argv.includes('--serve');
const mocks = {
  'next/link': `import React from 'react';export default function Link({href,children,prefetch,...p}){return <a href={href} {...p}>{children}</a>}`,
  'next/navigation': `export const usePathname=()=>'/website-inbox';export const useRouter=()=>({push:url=>location.href=url});`,
  '@clerk/nextjs': `export const useUser=()=>({isLoaded:true,isSignedIn:true,user:{fullName:'Test Operator',firstName:'Test',lastName:'Operator'}});export const useClerk=()=>({signOut:async()=>{}});`,
};
const bundle = await build({ stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/app/website-inbox/page';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'/tmp/hearthos-inbox-bundle',platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY':'"fixture"'},plugins:[{name:'isolated',setup(b){b.onResolve({filter:/^(next\/(link|navigation)|@clerk\/nextjs)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:process.cwd()}));}}] });
const css=(await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})).css;
const script=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
const moduleCss=bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'';
const id='11111111-1111-4111-8111-111111111111';
const fixture={configured:true,total:1,sync:{last_checked_at:'2026-09-09T12:00:00Z',last_complete_at:'2026-09-09T12:00:00Z'},items:[{external_id:id,kind:'order',received_at:'2026-09-09T12:00:00Z',status:'new',revision:0,follow_up_at:null,payload:{id,type:'order',createdAt:'2026-09-09T12:00:00Z',name:'Example Website Customer',email:'example@example.invalid',phone:'555-0100',subject:'Replacement remote and annual inspection',message:'Please call about this part and a service appointment.',total:150,metadata:{address:'100 Example Street, Test City, MO 65738'},items:[{name:'Demonstration remote control',sku:'TEST-001',quantity:1,price:150}]}}]};
const server=createServer((req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(script);return;}
  if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css+'\n'+moduleCss+'\n@font-face{font-family:InboxGeist;src:url(/font.woff2);font-weight:100 900}:root{--font-geist-sans:InboxGeist;--font-geist-mono:monospace}');return;}
  if(req.url==='/font.woff2'){readFile('node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2').then(bytes=>res.end(bytes));return;}
  if(req.url.startsWith('/api/')){
    const url=new URL(req.url,'http://localhost');
    let data = url.pathname==='/api/website-inbox' ? url.searchParams.has('id')?{activity:[]}:fixture : url.pathname==='/api/quickbooks/status'?{connected:true}:url.pathname==='/api/dispatch'?{techs:[],stats:{activeTechs:0}}:{};
    if(req.method!=='GET'){res.statusCode=503;data={error:'Read-only synthetic preview'};}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
if(serve){console.log(`Synthetic read-only Website Inbox preview: ${base}`);await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve)});server.close();}
else {
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  const browser=await chromium.launch();
  const output='/tmp/hearthos-website-inbox-qa';await mkdir(output,{recursive:true});
  try {
    for(const width of [390,1440]){
      const page=await browser.newPage({viewport:{width,height:900}});const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{if(new URL(route.request().url()).origin!==base)await route.abort();else await route.continue();});
      await page.goto(base);
      try { await page.getByRole('button',{name:/Example Website Customer/}).waitFor({timeout:10000}); }
      catch (error) { console.error({errors,body:await page.locator('body').innerText()}); throw error; }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:`${output}/inbox-${width}.png`,fullPage:true});
      await page.getByRole('button',{name:/Example Website Customer/}).click();
      const dialog=page.getByRole('dialog');await dialog.waitFor();
      assert.equal(await dialog.evaluate(el=>{const c=document.createElement('canvas');c.width=1;c.height=1;const ctx=c.getContext('2d');ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data[3]}),255);
      await dialog.getByLabel('Status',{exact:true}).selectOption('follow_up');
      await dialog.getByLabel('Follow-up date').fill('2026-09-12');
      await dialog.getByLabel('Note',{exact:true}).fill('Called today. Follow up Friday.');
      assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);
      await page.screenshot({path:`${output}/request-${width}.png`,fullPage:true});
      const attempts=[];await page.route('**/api/website-inbox',async route=>{
        if(route.request().method()!=='PATCH'){await route.continue();return;}
        attempts.push(route.request().postData());
        await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Simulated uncertain save'})});
      });
      await dialog.getByRole('button',{name:'Save update'}).click();
      await dialog.getByRole('button',{name:'Retry same update'}).click();
      await page.waitForTimeout(100);
      assert.equal(attempts.length,2);assert.equal(attempts[0],attempts[1]);
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log(JSON.stringify({pass:true,viewports:[390,1440],screenshots:output,liveAccess:false}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
