import http from 'node:http';

const PORT = Number(process.env.PORT || 4200);
const ENGINE_URL = (process.env.GABE_ENGINE_URL || 'http://127.0.0.1:4100').replace(/\/$/, '');
const ORCH_BUILD_ID = process.env.ORCH_BUILD_ID || 'orchestrator-local';
const ORCH_COMMIT_SHA = process.env.ORCH_COMMIT_SHA || 'unknown';
const ORCH_RUNTIME_NAME = process.env.ORCH_RUNTIME_NAME || 'gabe-orchestrator';
const VALIDATOR_VERSION = process.env.VALIDATOR_VERSION || 'v1';

function deriveSelectedEngine(payload = {}) {
  const notes = payload.validator_notes || [];
  const blob = `${payload.answer || ''} ${payload.quote || ''}`.toLowerCase();
  if (notes.some((n) => String(n).includes('vent_')) || blob.includes('vent')) return 'venting_engine';
  if (notes.some((n) => String(n).includes('wiring_')) || blob.includes('wiring')) return 'wiring_engine';
  return 'retrieval_backend';
}

function deriveRunOutcome(payload = {}) {
  const certainty = payload.certainty || 'Unverified';
  const st = payload.source_type || 'none';
  const ans = String(payload.answer || '').toLowerCase();
  if (st === 'none' && certainty === 'Unverified') return 'refused_unverified';
  if (ans.includes('not available in verified manufacturer documentation') || ans.includes('insufficient_')) return 'source_evidence_missing';
  if (certainty === 'Verified Exact') return 'answered_verified';
  if (certainty === 'Verified Partial' || certainty === 'Interpreted') return 'answered_partial';
  return 'escalated_handoff';
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, runtime: ORCH_RUNTIME_NAME, engineUrl: ENGINE_URL }));
      return;
    }

    if (req.method === 'POST' && req.url === '/query') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = body ? JSON.parse(body) : {};
      const question = parsed.question || parsed.message || '';

      const r = await fetch(`${ENGINE_URL}/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const text = await r.text();
      let payload;
      try { payload = JSON.parse(text); } catch { payload = { answer: text, source_type: 'none', certainty: 'Unverified', confidence: 0 }; }

      payload.engine_build_id = payload.engine_build_id || ORCH_BUILD_ID;
      payload.engine_commit_sha = payload.engine_commit_sha || ORCH_COMMIT_SHA;
      payload.engine_runtime_name = payload.engine_runtime_name || ORCH_RUNTIME_NAME;
      payload.selected_engine = payload.selected_engine || deriveSelectedEngine(payload);
      payload.run_outcome = payload.run_outcome || deriveRunOutcome(payload);
      payload.validator_version = payload.validator_version || VALIDATOR_VERSION;

      res.writeHead(r.status, { 'content-type': 'application/json' });
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
  console.log(`gabe-orchestrator listening on :${PORT} -> ${ENGINE_URL}/query`);
});
