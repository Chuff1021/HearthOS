import http from 'node:http';
import { buildWorkflow } from './src/graph.mjs';

const PORT = Number(process.env.PORT || 4200);
const ORCH_BUILD_ID = process.env.ORCH_BUILD_ID || 'orchestrator-local';
const ORCH_COMMIT_SHA = process.env.ORCH_COMMIT_SHA || 'unknown';
const ORCH_RUNTIME_NAME = process.env.ORCH_RUNTIME_NAME || 'gabe-orchestrator-langgraph';

const workflow = buildWorkflow();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, runtime: ORCH_RUNTIME_NAME, workflow: 'langgraph' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/query') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = body ? JSON.parse(body) : {};
      const question = parsed.question || parsed.message || '';

      const state = await workflow.invoke({ question });
      const payload = state.payload || {};

      payload.retrieval_engine_build_id = payload.engine_build_id || 'unknown';
      payload.retrieval_engine_commit_sha = payload.engine_commit_sha || 'unknown';
      payload.retrieval_backend_runtime_name = payload.engine_runtime_name || 'unknown';

      payload.engine_build_id = ORCH_BUILD_ID;
      payload.engine_commit_sha = ORCH_COMMIT_SHA;
      payload.engine_runtime_name = ORCH_RUNTIME_NAME;
      payload.orchestrator_runtime = 'langgraph';
      payload.orchestrator_runtime_name = ORCH_RUNTIME_NAME;

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'orchestrator_error', message: String(e?.message || e) }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`gabe-orchestrator (LangGraph) listening on :${PORT}`);
});
