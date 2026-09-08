import { createServer } from "node:http";
import { build } from "esbuild";

// Isolated synthetic UI harness: no app environment, database, or providers.
const bundle = await build({ entryPoints: ["tests/browser/record-query-fixture.tsx"], bundle: true, write: false, format: "iife", define: { "process.env.NODE_ENV": '"development"' } });
const server = createServer((request, response) => {
  if (request.url === "/fixture.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end(bundle.outputFiles[0].text);
  } else if (request.url?.startsWith("/records/")) {
    const record = request.url.split("/").pop();
    setTimeout(() => {
      response.writeHead(record === "failed" ? 503 : 200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(record === "failed" ? { error: "Record unavailable. Retry required." } : { name: `${record} synthetic record` }));
    }, record === "slow" ? 2500 : 20);
  } else {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HearthOS isolated verification</title><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  }
});
server.listen(4119, "127.0.0.1", () => console.log("Synthetic verification: http://127.0.0.1:4119"));
