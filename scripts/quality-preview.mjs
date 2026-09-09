import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const log=await open('/tmp/hearthos-quality-preview.log','a',0o600);
const child=spawn(process.execPath,['scripts/quality-ui.mjs','--serve'],{
 cwd:root,detached:true,stdio:['ignore','pipe',log.fd],
 env:Object.fromEntries(['PATH','HOME','TMPDIR'].flatMap(key=>process.env[key]?[[key,process.env[key]]]:[])),
});
let output='';
const timeout=setTimeout(()=>{child.kill('SIGTERM');console.error('Preview startup timed out');process.exitCode=1},60000);
child.stdout.on('data',chunk=>{
 output+=chunk;
 if(output.includes('Read-only synthetic quality preview:')){
  clearTimeout(timeout);
  console.log(output.trim());
  console.log(`Preview PID: ${child.pid}; stop with kill ${child.pid}`);
  child.stdout.destroy();
  child.unref();
  void log.close();
 }
});
child.once('error',error=>{clearTimeout(timeout);console.error(error.message);process.exitCode=1;void log.close()});
