import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// Actual CRM components with isolated synthetic HTTP and identity, never live data.
const require = createRequire(import.meta.url);
const serveOnly = process.argv.includes('--serve');
const fixtureModules = {
  'next/navigation': `import {useSyncExternalStore,useMemo} from 'react';
    const subscribe=f=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f)};
    const location=()=>window.location.pathname+window.location.search;
    export function usePathname(){return useSyncExternalStore(subscribe,location,location).split('?')[0]}
    export function useSearchParams(){const url=useSyncExternalStore(subscribe,location,location);return useMemo(()=>new URLSearchParams(url.split('?')[1]||''),[url])}
    const go=(url,replace=false)=>{history[replace?'replaceState':'pushState']({},'',url);window.dispatchEvent(new PopStateEvent('popstate'))};
    export const useRouter=()=>({push:go,replace:url=>go(url,true),back:()=>history.back(),refresh:()=>window.dispatchEvent(new PopStateEvent('popstate'))});`,
  'next/link': `import React from 'react';export default function Link({children,href,onClick,prefetch,replace,...props}){return <a {...props} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey){event.preventDefault();history[replace?'replaceState':'pushState']({},'',href);window.dispatchEvent(new PopStateEvent('popstate'));}}}>{children}</a>}`,
  'next/dynamic': `import React,{lazy,Suspense} from 'react';export default(loader,options)=>{const Component=lazy(loader);return props=><Suspense fallback={options?.loading?<options.loading/>:null}><Component {...props}/></Suspense>}`,
  '@clerk/nextjs': `export const useUser=()=>({isLoaded:true,isSignedIn:true,user:{id:'fixture-user',firstName:'Synthetic',lastName:'Operator',fullName:'Synthetic Operator',username:'fixture',primaryEmailAddress:{emailAddress:'operator@example.invalid'}}});export const useClerk=()=>({signOut:async()=>{window.fixtureSignedOut=true}});`,
};
const bundle = await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';
 import{usePathname}from'next/navigation';import Dashboard from './src/app/page';import Jobs from './src/app/jobs/page';
 import Customers from './src/app/customers/page';import Schedule from './src/app/schedule/page';
 function App(){const route=usePathname();const Component=route==='/'?Dashboard:route==='/jobs'?Jobs:route==='/customers'?Customers:route==='/schedule'?Schedule:()=> <main><h1>Fixture destination</h1><p>{route}</p></main>;return <Component/>}
 createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},
 bundle:true,write:false,outdir:'/tmp/hearthos-quality-bundle',platform:'browser',format:'iife',jsx:'automatic',
 loader:{'.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY':'"fixture-only"','process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN':'""','process.env.NEXT_PUBLIC_MAPBOX_TOKEN':'""'},
 plugins:[{name:'isolated-adapters',setup(builder){
  builder.onResolve({filter:/^(next\/(navigation|link|dynamic)|@clerk\/nextjs)$/},args=>({path:args.path,namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtureModules[args.path],loader:'tsx',resolveDir:process.cwd()}));
 }}]});
const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
const css=(await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})).css;
const moduleCss=(bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')+'\n@font-face{font-family:QualityGeist;src:url(/fixture-font.woff2) format("woff2");font-weight:100 900;font-display:swap}:root{--font-geist-sans:QualityGeist;--font-geist-mono:monospace}';
const server=createServer((req,res)=>{
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','application/javascript');res.end(js);}
 else if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css+'\n'+moduleCss);}
 else if(req.url==='/fixture-font.woff2'){res.setHeader('Content-Type','font/woff2');readFile('node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2').then(bytes=>res.end(bytes));}
 else if(req.url.startsWith('/api/')){
  const url=new URL(req.url,'http://localhost');
  const body=serveOnly && req.method==='GET' ? fixtures[url.pathname] : null;
  res.writeHead(body?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify(body||{error:'Read-only synthetic preview; no live data or writes'}));
 }
 else if(/\.(png|jpg|webp|svg|woff2)(\?|$)/.test(req.url)){
  const file=path.resolve('public','.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(path.resolve('public')+path.sep)){res.writeHead(404);res.end();return;}
  readFile(file).then(bytes=>res.end(bytes)).catch(()=>{res.writeHead(404);res.end();});
 } else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const output=path.resolve(process.env.QUALITY_SCREENSHOT_DIR||'/tmp/hearthos-quality-qa');
await mkdir(output,{recursive:true});
const now=new Date(), today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const customer={id:'11111111-1111-4111-8111-111111111111',qbCustomerId:'123',displayName:'Example Hearth Customer',firstName:'Example',lastName:'Customer',companyName:null,email:'customer@example.invalid',phone:'555-0100',address:{line1:'100 Example Street',line2:'Lot 5',city:'Test City',state:'PA',zip:'17000'},isActive:true,balance:120,invoiceCount:2,openInvoiceCount:1,paymentCount:1,totalRevenue:500,lastActivity:today};
const tech={id:'fixture-tech',name:'Example Technician',firstName:'Example',lastName:'Technician',color:'#2674b8',techColor:'#2674b8',isActive:true,status:'available',location:null,jobsToday:1,jobsDone:0};
const job={id:'22222222-2222-4222-8222-222222222222',jobNumber:'J-100',customerId:customer.id,customerName:customer.displayName,title:'Annual inspection',jobType:'inspection',status:'scheduled',priority:'normal',scheduledDate:today,scheduledTimeStart:'09:00',scheduledTimeEnd:'11:00',assignedTechs:[{id:tech.id,name:tech.name,color:tech.color}],propertyAddress:'100 Example Street, Lot 5, Test City, PA 17000',notes:'Synthetic test record',totalAmount:120,createdAt:now.toISOString(),updatedAt:now.toISOString()};
const moneyBar={totalDue:120,openInvoiceCount:1,overdueAmount:0,overdueCount:0,revenueYTD:500,ytdInvoiceCount:2};
const fixtures={
 '/api/quickbooks/status':{connected:true},'/api/techs':{techs:[tech]},
 '/api/dispatch':{techs:[tech],jobs:[job],unassignedJobs:[],stats:{activeTechs:1,onJob:0,available:1,offline:0,unassigned:0}},
 '/api/jobs':{jobs:[job]},'/api/jobs/context':{job,invoices:[],estimates:[],payments:[]},
 '/api/time-off-requests':{requests:[]},'/api/meeks/jobs':{jobs:[]},
 '/api/customers/center':{items:[customer],totals:{customers:1,balance:120,openInvoices:1,revenue:500},moneyBar},
 '/api/customer-lookup':{customers:[customer],source:'quickbooks'},
 '/api/vendors':{items:[],moneyBar:{totalOwed:0,openBillCount:0,overdueAmount:0,overdueCount:0,openPOValue:0}},
 '/api/reports/profit-by-job':{windowStats:{revenue:500,profit:300,cogs:200,billable:500,margin:60,invoiceCount:2},jobs:[]},
 '/api/dashboard':{stats:{activeTechs:1,jobsToday:1},recentJobs:[job]},'/api/dashboard/activity':{activity:[]},
};
if(serveOnly){
 console.log(`Read-only synthetic quality preview: ${base}`);
 await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve)});
 await new Promise(resolve=>server.close(resolve));
 process.exit(0);
}
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser=await chromium.launch({headless:true});
const errors=[],screenshots=[],checks=[];
try{
 for(const viewport of (process.env.QUALITY_VIEWPORTS ? JSON.parse(process.env.QUALITY_VIEWPORTS) : [{width:320,height:740},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1440,height:1000},{width:1600,height:1100}])){
  const page=await browser.newPage({viewport});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==base){await route.abort();return;}
   if(!url.pathname.startsWith('/api/')){await route.continue();return;}
   if(req.method()!=='GET'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic save failure; no real record was changed'})});return;}
   let body=fixtures[url.pathname];
   if(url.pathname==='/api/search')body={customers:[{id:customer.id,title:customer.displayName,subtitle:'100 Example Street',href:`/customers/${customer.id}`,type:'customer'}],jobs:[],invoices:[]};
   await route.fulfill({status:body?200:503,contentType:'application/json',body:JSON.stringify(body||{error:'Unconfigured synthetic endpoint'})});
  });
  for(const route of ['/','/jobs','/customers','/schedule']){
   await page.goto(base+route);
   try { await page.locator('h1').first().waitFor({timeout:10000}); } catch(error) {
    await page.screenshot({path:path.join(output,'failed-render.png'),fullPage:true});
    console.error('Render failure',route,viewport,errors,await page.locator('h1').first().evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),parents:[el,...(function*(node){while(node.parentElement){node=node.parentElement;yield node}})(el)].map(n=>({tag:n.tagName,class:n.className,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,height:getComputedStyle(n).height}))})));
    throw error;
   }
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForTimeout(350);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Page overflow at ${route} ${viewport.width}`);
   if(route==='/schedule'&&viewport.width>=1024){
    assert.equal(await page.locator('.grid.sticky').evaluateAll(elements=>elements.length>0&&elements.every(element=>{
     const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
     const context=canvas.getContext('2d');context.fillStyle=getComputedStyle(element).backgroundColor;
     context.fillRect(0,0,1,1);return context.getImageData(0,0,1,1).data[3]===255;
    })),true,'Calendar headers must hide appointments scrolling underneath');
   }
   if(route==='/schedule'&&viewport.width<1024){
    const agenda=page.getByRole('heading',{name:'This week',exact:true});
    await agenda.waitFor();
    assert.equal(await agenda.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;}),true,'Phone agenda must start in view, not scroll to the desktop hour');
   }
   const file=path.join(output,`${route==='/'?'dashboard':route.slice(1)}-${viewport.width}.png`);
   await page.screenshot({path:file,fullPage:true});screenshots.push(file);
  }
  await page.goto(base+'/customers');
  await page.getByRole('button',{name:'New customer',exact:true}).click();
  const customerDialog=page.getByRole('dialog',{name:'New customer',exact:true});
  await customerDialog.waitFor();
  assert.equal(await customerDialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),true,'Customer dialog fits viewport');
  await page.getByLabel('Display name (required)',{exact:true}).fill('QA synthetic customer');
  await page.getByLabel('Address line 2',{exact:true}).fill('Lot 9');
  await page.screenshot({path:path.join(output,`customer-create-${viewport.width}.png`)});
  await customerDialog.getByRole('button',{name:'Create customer',exact:true}).click();
  await customerDialog.getByRole('button',{name:'Check creation status',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Display name (required)',{exact:true}).isDisabled(),true);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'New customer',exact:true}).click();
  assert.equal(await page.getByLabel('Address line 2',{exact:true}).inputValue(),'Lot 9');
  await customerDialog.getByRole('button',{name:'Close new customer',exact:true}).click();
  if(viewport.width>=1024){
   await page.goto(base);
   await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
   assert.equal(await page.locator('.hearth-sidebar').evaluate(el=>Array.from(el.querySelectorAll('a,button')).filter(node=>{const r=node.getBoundingClientRect(),p=el.getBoundingClientRect();return r.left<p.left-1||r.right>p.right+1}).length),0);
   await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
   await page.getByRole('button',{name:'Switch to dark mode'}).click();
   assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
   await page.waitForTimeout(400);
   await page.screenshot({path:path.join(output,`dark-${viewport.width}.png`),fullPage:true});
   await page.getByRole('button',{name:'Switch to light mode'}).click();
   await page.keyboard.press('Control+k');
   const search=page.getByRole('combobox',{name:'Search customers, jobs, and invoices'});
   assert.equal(await search.evaluate(el=>el===document.activeElement),true);
   await search.fill('Example');
   await page.getByRole('dialog',{name:'Search results'}).getByRole('link').first().waitFor();
   await page.keyboard.press('ArrowDown');
   assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-search-result')!==null),true);
   await page.keyboard.press('Escape');
   assert.equal(await search.getAttribute('aria-expanded'),'false');
   await page.getByRole('link',{name:'Quick Add',exact:true}).click();
   await page.waitForURL('**/jobs?create=1');
   await page.getByRole('button',{name:'Cancel',exact:true}).first().waitFor();
   assert.ok(await page.getByRole('option',{name:/Follow.up/i}).count()>0);
   assert.ok(await page.getByRole('option',{name:/Custom/i}).count()>0);
   await page.getByLabel('Search customers...', {exact:true}).fill('Example');
   await page.getByRole('button',{name:/^Example Hearth Customer.*100 Example/}).click();
   assert.match(await page.getByLabel('Property address',{exact:true}).inputValue(),/Lot 5/);
   await page.getByLabel('Job title',{exact:true}).fill('Fixture inspection');
   await page.getByRole('button',{name:'Create Job',exact:true}).click();
   await page.getByRole('alert').filter({hasText:/Could not create job/}).waitFor();
   assert.equal(await page.getByLabel('Job title',{exact:true}).inputValue(),'Fixture inspection');
   assert.match(await page.getByLabel('Property address',{exact:true}).inputValue(),/Lot 5/);
   await page.screenshot({path:path.join(output,`failed-job-save-${viewport.width}.png`),fullPage:true});
   await page.getByRole('button',{name:'Cancel',exact:true}).first().click();
   await page.goto(base+'/jobs?id='+job.id);
   await page.getByRole('heading',{name:'Annual inspection',level:2,exact:true}).waitFor();
   await page.getByRole('button',{name:'Edit',exact:true}).waitFor();
   checks.push(`Search, theme, collapsed sidebar, Quick Add, address prefill, failed save retention, exact job link at ${viewport.width}`);
  }else{
   await page.getByRole('button',{name:'More navigation',exact:true}).click();
   await page.getByRole('dialog').waitFor();
   assert.equal(await page.getByRole('button',{name:'Close navigation'}).evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Shift+Tab');
   assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog'))),true);
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog'))),true);
   await page.getByRole('dialog').getByRole('link',{name:'Purchase Orders',exact:true}).waitFor();
   await page.getByRole('dialog').getByRole('link',{name:'QuickBooks',exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(output,`navigation-${viewport.width}.png`),fullPage:true});
   await page.keyboard.press('Escape');
   assert.equal(await page.getByRole('dialog').count(),0);
   assert.equal(await page.getByRole('button',{name:'More navigation'}).evaluate(el=>el===document.activeElement),true);
   await page.getByRole('button',{name:'More navigation'}).click();
   await page.getByRole('button',{name:'Close navigation'}).click();
   assert.equal(await page.getByRole('dialog').count(),0);
   await page.getByRole('button',{name:'More navigation'}).click();
   await page.setViewportSize({width:1100,height:900});
   assert.equal(await page.getByRole('dialog').count(),0);
   checks.push(`Mobile drawer focus, scrolling, dismissal, breakpoint cleanup at ${viewport.width}`);
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,mode:'actual-components-synthetic-http',screenshots,checks,consoleErrors:errors.length,liveProviderAcceptance:false},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
