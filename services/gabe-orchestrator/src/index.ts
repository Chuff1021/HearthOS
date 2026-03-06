import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { VALIDATOR_VERSION, validateAnswerPath } from "../../gabe-validator/src";
import { debugModeEnabled, env } from "./config";
import { runComplianceEngine } from "./engines/compliance";
import { runGeneralRetrievalEngine } from "./engines/general-retrieval";
import { runPartsEngine } from "./engines/parts";
import { runVentingEngine } from "./engines/venting";
import { runWiringEngine } from "./engines/wiring";
import type { EngineName, OrchestratorQuery, OrchestratorResponse } from "./types";

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      return sendJson(response, 400, { error: "missing url" });
    }

    if (request.method === "GET" && request.url === "/health") {
      return sendJson(response, 200, {
        ok: true,
        runtime: env.ENGINE_RUNTIME_NAME,
        buildId: env.ENGINE_BUILD_ID,
        commitSha: env.ENGINE_COMMIT_SHA,
        validatorVersion: VALIDATOR_VERSION,
      });
    }

    if (request.method === "POST" && request.url === "/query") {
      const body = (await readJson(request)) as OrchestratorQuery;
      if (!body?.question) {
        return sendJson(response, 400, { error: "question required" });
      }

      const selectedEngine = selectEngine(body.question);
      const candidate = await executeEngine(selectedEngine, body.question);
      const { answer, result } = validateAnswerPath(candidate, { selectedEngine });

      const diagnostics = {
        engine_build_id: env.ENGINE_BUILD_ID,
        engine_commit_sha: env.ENGINE_COMMIT_SHA,
        engine_runtime_name: env.ENGINE_RUNTIME_NAME,
        selected_engine: selectedEngine,
        certainty: result.certainty,
        run_outcome: result.runOutcome,
        validator_version: VALIDATOR_VERSION,
      };

      const payload: OrchestratorResponse = {
        ...answer,
        run: {
          selectedEngine,
          certainty: result.certainty,
          runOutcome: result.runOutcome,
          truthAuditStatus: result.truthAuditStatus,
          sourceEvidenceStatus: result.sourceEvidenceStatus,
          auditClassification: result.auditClassification,
          validatorVersion: VALIDATOR_VERSION,
          diagnostics,
        },
      };

      if (debugModeEnabled || body.debug) {
        payload.debug = diagnostics;
      }

      return sendJson(response, 200, payload);
    }

    return sendJson(response, 404, { error: "not found" });
  } catch (error) {
    return sendJson(response, 500, {
      error: "orchestrator failure",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(Number(env.PORT), "0.0.0.0", () => {
  console.log(`gabe-orchestrator listening on ${env.PORT}`);
});

function selectEngine(question: string): EngineName {
  const q = question.toLowerCase();
  if (/(vent|termination|horizontal run|vertical rise|elbow)/.test(q)) return "venting";
  if (/(wire|wiring|millivolt|thermopile|switch leg|voltage)/.test(q)) return "wiring";
  if (/(part number|part #|replacement part|exploded view)/.test(q)) return "parts";
  if (/(clearance|code|listed|approved|inspection|compliance)/.test(q)) return "compliance";
  return "general_retrieval";
}

async function executeEngine(selectedEngine: EngineName, question: string) {
  switch (selectedEngine) {
    case "venting":
      return runVentingEngine(env.GABE_RETRIEVAL_URL, question);
    case "wiring":
      return runWiringEngine(env.GABE_RETRIEVAL_URL, question);
    case "parts":
      return runPartsEngine(env.GABE_RETRIEVAL_URL, question);
    case "compliance":
      return runComplianceEngine(env.GABE_RETRIEVAL_URL, question);
    case "general_retrieval":
    default:
      return runGeneralRetrievalEngine(env.GABE_RETRIEVAL_URL, question);
  }
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}
