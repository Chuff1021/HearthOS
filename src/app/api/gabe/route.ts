import { NextRequest, NextResponse } from "next/server";
import { buildGabeSystemPrompt } from "@/lib/gabe/prompts";
import { listManuals, listManualSections } from "@/lib/manuals";
import { saveGabeMessage } from "@/lib/gabe-messages";
import postgres from "postgres";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface GroqResponse {
  choices: {
    message: {
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface SelectedManual {
  manualId: string;
  manualTitle?: string;
}

interface OrchestratorResponse {
  answer: string;
  source_type: "manual" | "web" | "none";
  manual_title?: string;
  page_number?: number;
  source_url?: string;
  quote?: string;
  confidence: number;
  run: {
    selectedEngine: string;
    certainty: "verified_exact" | "verified_partial" | "interpreted" | "unverified";
    runOutcome:
      | "answered_verified"
      | "answered_partial"
      | "refused_unverified"
      | "escalated_handoff"
      | "source_evidence_missing";
    truthAuditStatus: "pending" | "passed" | "failed" | "needs_review";
    sourceEvidenceStatus: "present" | "partial" | "missing" | "not_applicable";
    auditClassification: "standard" | "source_evidence" | "validator";
    validatorVersion: string;
    diagnostics: {
      engine_build_id: string;
      engine_commit_sha: string;
      engine_runtime_name: string;
      selected_engine: string;
      certainty: "verified_exact" | "verified_partial" | "interpreted" | "unverified";
      run_outcome:
        | "answered_verified"
        | "answered_partial"
        | "refused_unverified"
        | "escalated_handoff"
        | "source_evidence_missing";
      validator_version: string;
    };
  };
  debug?: {
    engine_build_id: string;
    engine_commit_sha: string;
    engine_runtime_name: string;
    selected_engine: string;
    certainty: string;
    run_outcome: string;
    validator_version: string;
  };
}

export async function GET() {
  const orchestratorUrl = process.env.GABE_ORCHESTRATOR_URL;
  const engineUrl = process.env.GABE_ENGINE_URL;
  const engineRequired = (process.env.GABE_ENGINE_REQUIRED ?? "false").toLowerCase() === "true";

  const result: Record<string, unknown> = {
    engineRequired,
    orchestratorConfigured: Boolean(orchestratorUrl),
    engineConfigured: Boolean(engineUrl),
    status: "ok",
  };

  try {
    const probeUrl = orchestratorUrl || engineUrl;
    if (probeUrl) {
      const ping = await fetch(`${probeUrl.replace(/\/$/, "")}/health`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      });
      result.runtimeReachable = ping.ok;
      result.runtimeStatus = ping.status;
    } else {
      result.runtimeReachable = false;
      result.runtimeStatus = null;
      if (engineRequired) {
        result.status = "degraded";
      }
    }
  } catch {
    result.runtimeReachable = false;
    result.runtimeStatus = null;
    result.status = "degraded";
  }

  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages: ChatMessage[];
      jobContext?: {
        fireplace?: string;
        jobType?: string;
        jobId?: string;
      };
      selectedManual?: SelectedManual;
      techId?: string;
      techName?: string;
    };

    const { messages, jobContext, selectedManual, techId, techName } = body;
    const jobId = jobContext?.jobId;
    const jobNumber = jobContext?.jobId ? `JOB-2026-${jobContext.jobId.split("-").pop()}` : undefined;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    let allManuals: Awaited<ReturnType<typeof listManuals>> = [];
    try {
      allManuals = await listManuals();
    } catch (e) {
      console.warn("[GABE] Failed to load manuals (non-fatal):", e);
    }
    const modelContext = (jobContext?.fireplace || "").trim();
    const modelManualCandidates = modelContext
      ? allManuals.filter((m) => `${m.brand} ${m.model}`.toLowerCase().includes(modelContext.toLowerCase()) || m.model.toLowerCase().includes(modelContext.toLowerCase()))
      : [];
    const exactInstallManual = modelManualCandidates.find((m) => /install/i.test(String(m.type || ""))) || modelManualCandidates[0] || null;
    const effectiveSelectedManual = selectedManual?.manualId
      ? selectedManual
      : exactInstallManual
      ? { manualId: exactInstallManual.id, manualTitle: `${exactInstallManual.brand} ${exactInstallManual.model} (${exactInstallManual.type})` }
      : selectedManual;

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content;
    const contextualQuestion = [
      lastUserMessage,
      jobContext?.fireplace ? `Model context: ${jobContext.fireplace}` : null,
      selectedManual?.manualTitle ? `Manual context: ${selectedManual.manualTitle}` : null,
      exactInstallManual ? `Exact model constraint: Use ${exactInstallManual.brand} ${exactInstallManual.model} (${exactInstallManual.type}) from ${exactInstallManual.url}. Do not use nearby models.` : null,
    ].filter(Boolean).join("\n");
    const orchestratorUrl = process.env.GABE_ORCHESTRATOR_URL;
    const engineUrl = process.env.GABE_ENGINE_URL;
    const engineRequired = (process.env.GABE_ENGINE_REQUIRED ?? "false").toLowerCase() === "true";

    // Local manual-guard path removed; use orchestrator/engine pipeline only.


    // IMPORTANT: do not short-circuit to local manual fallback for vent/pipe intents.
    // Always run the live engine/orchestrator pipeline first so manual-id gating,
    // section routing, fact-first, and validator enforcement remain active.

    if (orchestratorUrl && lastUserMessage) {
      const orchestratorRes = await fetch(`${orchestratorUrl.replace(/\/$/, "")}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: contextualQuestion || lastUserMessage,
          conversationId: jobId ?? techId ?? undefined,
          selectedManualId: effectiveSelectedManual?.manualId,
          selectedManualTitle: effectiveSelectedManual?.manualTitle,
          debug: process.env.GABE_DEBUG_MODE === "true",
        }),
      });

      if (!orchestratorRes.ok) {
        const error = await orchestratorRes.text();
        console.error("GABE orchestrator error:", error);
        return NextResponse.json({
          answer: "This information is not available in verified manufacturer documentation.",
          source_type: "none",
          confidence: 0,
          run_outcome: "source_evidence_missing",
          backend: "orchestrator",
          backend_status: orchestratorRes.status,
        });
      }

      const data = await orchestratorRes.json() as OrchestratorResponse;

      // Keep orchestrator/engine refusal behavior intact; no local manual fallback bypass.

      const assistantMessage = data.answer ?? "";

      try {
        saveConversationLog({
          techId,
          techName,
          jobId,
          jobNumber,
          fireplace: jobContext?.fireplace,
          messages,
          assistantMessage,
        });
        await persistRunMetadata({
          response: data,
          question: lastUserMessage,
          jobId,
          techId,
        });
      } catch (e) {
        console.error("Failed to save orchestrator run state:", e);
      }

      return NextResponse.json({
        ...data,
        backend: "orchestrator",
      });
    }

    if (engineUrl && lastUserMessage) {
      const engineRes = await fetch(`${engineUrl.replace(/\/$/, "")}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: contextualQuestion || lastUserMessage }),
      });

      if (!engineRes.ok) {
        const error = await engineRes.text();
        console.error("GABE engine error:", error);
        return NextResponse.json({
          answer: "Verified source evidence is currently unavailable.",
          source_type: "none",
          confidence: 0,
          run_outcome: "source_evidence_missing",
        });
      }

      const data = await engineRes.json();

      // Do not fallback to local manual snippet retrieval here.
      // Return engine/orchestrator verdict directly so refusals stay safe.

      const assistantMessage = data?.answer ?? data?.message ?? "";

      try {
        saveConversationLog({
          techId,
          techName,
          jobId,
          jobNumber,
          fireplace: jobContext?.fireplace,
          messages,
          assistantMessage,
        });
      } catch (e) {
        console.error("Failed to save message log:", e);
      }

      return NextResponse.json({
        ...data,
        backend: "engine",
      });
    }

    if (engineRequired) {
      return NextResponse.json({
        error: "GABE engine routing is required but neither GABE_ORCHESTRATOR_URL nor GABE_ENGINE_URL is configured.",
        source_type: "none",
        run_outcome: "source_evidence_missing",
      }, { status: 503 });
    }

    const nvidiaApiKey = process.env.NVIDIA_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;
    const llmApiKey = nvidiaApiKey || groqApiKey;
    const llmBaseUrl = nvidiaApiKey
      ? "https://integrate.api.nvidia.com/v1/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";
    const modelOverride = nvidiaApiKey
      ? (process.env.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-ultra-253b-v1")
      : (process.env.GROQ_MODEL || "llama-3.1-8b-instant");

    console.log("[GABE] LLM provider:", nvidiaApiKey ? "NVIDIA" : "Groq");
    console.log("[GABE] LLM model:", modelOverride);
    console.log("[GABE] API key present:", !!llmApiKey);

    if (!llmApiKey) {
      const brandCounts = allManuals.reduce((acc, m) => {
        acc[m.brand] = (acc[m.brand] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const brandSummary = Object.entries(brandCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([brand, count]) => `${brand}: ${count}`)
        .join(", ");

      const manualList = allManuals.length > 0
        ? allManuals.slice(0, 30).map(m => `- ${m.brand} ${m.model}${m.pages ? ` (${m.pages} pages)` : ""}${m.url ? " — 🔗" : ""}`).join("\n")
        : "No manuals loaded - check /api/manuals endpoint";

      const fallbackResponse = `🔥 **GABE AI is not configured** — No LLM API key found.

**Current Status:** Neither NVIDIA_API_KEY nor GROQ_API_KEY is set.

**📚 Manual Library Status:**
- **Total Manuals:** ${allManuals.length}
- **Brand Distribution:** ${brandSummary}

Here are the manuals I have access to:
${manualList}
${allManuals.length > 30 ? `\n...and ${allManuals.length - 30} more manuals` : ""}

---

**Common Fireplace Troubleshooting:**

**Pilot Light Issues:**
1. Check gas valve is ON at unit and main
2. Clean thermocouple tip with fine sandpaper
3. Thermopile should read 500–750mV when heated
4. Check for air in gas line (new installs)
5. Verify spark igniter gap (1/8")

**Thermocouple Testing:** Should read 15–30mV when heated
**Thermopile Testing:** Should read 350–750mV fully heated (3–5 min)

⚠️ **Safety First:** If you smell gas, shut off supply and ventilate before troubleshooting.

**To enable full AI responses:** Add NVIDIA_API_KEY to your Vercel environment variables and redeploy.`;

      try {
        saveConversationLog({
          techId,
          techName,
          jobId,
          jobNumber,
          fireplace: jobContext?.fireplace,
          messages,
          assistantMessage: fallbackResponse,
        });
      } catch (e) {
        console.error("Failed to save message log:", e);
      }

      return NextResponse.json({
        message: fallbackResponse,
        usage: null,
        manualsCount: allManuals.length,
      });
    }

    const fireplaceHint = jobContext?.fireplace?.toLowerCase();
    const matchedManuals = fireplaceHint
      ? allManuals.filter((m) => {
          const brandMatch = m.brand?.toLowerCase() && fireplaceHint.includes(m.brand.toLowerCase());
          const modelMatch = m.model?.toLowerCase() && fireplaceHint.includes(m.model.toLowerCase());
          return brandMatch || modelMatch;
        })
      : [];

    const selectedManualRecord = effectiveSelectedManual?.manualId
      ? allManuals.find((manual) => manual.id === effectiveSelectedManual.manualId)
      : undefined;
    const prioritizedManuals = selectedManualRecord
      ? [selectedManualRecord]
      : matchedManuals.length > 0
        ? matchedManuals
        : allManuals;

    const manualsForPrompt = prioritizedManuals.slice(0, 25);
    const manualIds = new Set(manualsForPrompt.map((m) => m.id));
    let allSections: Awaited<ReturnType<typeof listManualSections>> = [];
    try {
      allSections = selectedManualRecord
        ? await listManualSections(selectedManualRecord.id)
        : await listManualSections();
    } catch (e) {
      console.warn("[GABE] Failed to load manual sections (non-fatal):", e);
    }
    const sectionsForPrompt = allSections
      .filter((s) => manualIds.has(s.manualId))
      .slice(0, 200);

    const systemPrompt = buildGabeSystemPrompt(jobContext, {
      manuals: manualsForPrompt,
      sections: sectionsForPrompt,
    });

    console.log("[GABE] Calling LLM API with", messages.length, "messages");
    const response = await fetch(llmBaseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${llmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelOverride,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 4096,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("LLM API error:", error);

      const isAuthError = response.status === 401 || response.status === 403;
      let errorMessage = "AI service temporarily unavailable";

      try {
        const errorJson = JSON.parse(error);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {}

      return NextResponse.json({
        error: errorMessage,
        isKeyConfigured: !!llmApiKey,
        isAuthError,
        details: error,
      }, { status: isAuthError ? 401 : 503 });
    }

    const data = await response.json() as GroqResponse;
    let assistantMessage = data.choices[0]?.message?.content || "";

    // Nemotron Ultra wraps reasoning in <think>...</think> tags — strip them
    assistantMessage = assistantMessage.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    if (!assistantMessage) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    try {
      saveConversationLog({
        techId,
        techName,
        jobId,
        jobNumber,
        fireplace: jobContext?.fireplace,
        messages,
        assistantMessage,
      });
    } catch (e) {
      console.error("Failed to save message log:", e);
    }

    return NextResponse.json({
      message: assistantMessage,
      usage: data.usage,
      manualsCount: allManuals.length,
    });
  } catch (err) {
    console.error("GABE API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function pickBestManualSection(question: string, sections: Array<{ pageStart?: number | null; title?: string | null; snippet?: string | null }>) {
  if (!sections.length) return null;

  const qTokens = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => t.length > 2);

  let best: { section: typeof sections[number]; score: number } | null = null;

  for (const section of sections) {
    const hay = `${section.title ?? ""} ${section.snippet ?? ""}`.toLowerCase();
    if (!hay.trim()) continue;

    let score = 0;
    for (const t of qTokens) {
      if (hay.includes(t)) score += 1;
    }

    if (/vent|clearance|install|gas|manifold|pilot|light|startup|ignition/.test(question.toLowerCase())) {
      if (/vent|clearance|install|gas|manifold|pilot|lighting|startup|ignition/.test(hay)) score += 2;
    }

    if (!best || score > best.score) {
      best = { section, score };
    }
  }

  if (!best) return null;

  // If lexical overlap is weak but manual sections exist, still use selected-manual evidence
  // rather than silently switching manuals.
  if (best.score <= 0) {
    const fallback = sections.find((s) => (s.snippet ?? "").trim().length > 0);
    return fallback ?? null;
  }

  return best.section;
}

function buildStrictManualAnswer(question: string, section: { title?: string | null; snippet?: string | null }) {
  const quote = (section.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 420);
  if (!quote) {
    return "I could not verify this answer in the selected manual.";
  }

  const titlePrefix = section.title ? `${section.title}: ` : "";
  return `${titlePrefix}Manual states: "${quote}"`;
}

async function buildManualFallback(question: string, preferredManualId?: string) {
  const manuals = await listManuals();
  const sections = preferredManualId ? await listManualSections(preferredManualId) : await listManualSections();
  if (!sections.length) return null;

  const q = question.toLowerCase();
  const isPipeQuestion = /\b(pipe|vent|venting|diameter|liner|run\b|elbow|clearance)\b/.test(q);

  const narrowed = isPipeQuestion
    ? sections.filter((s) => /\b(pipe|vent|venting|diameter|liner|run|elbow|clearance|termination)\b/i.test(`${s.title ?? ""} ${s.snippet ?? ""}`))
    : sections;

  const candidates = narrowed.length ? narrowed : sections;
  const best = pickBestManualSection(question, candidates as Array<{ pageStart?: number | null; title?: string | null; snippet?: string | null }>);
  if (!best) return null;

  const picked = candidates.find((s) => s.pageStart === best.pageStart && s.title === best.title && s.snippet === best.snippet) ?? candidates[0];
  const manual = manuals.find((m) => m.id === (picked as any).manualId);
  if (!manual) return null;

  const manualTitle = `${manual.brand} ${manual.model}`.replace(/\s+/g, " ").trim();
  return {
    answer: buildStrictManualAnswer(question, best),
    source_type: "manual",
    manual_title: manualTitle,
    page_number: best.pageStart ?? null,
    source_url: manual.url,
    confidence: 68,
    selected_manual_title: manualTitle,
    answered_from_selected_manual: Boolean(preferredManualId ? manual.id === preferredManualId : true),
    cited_manual_title: manualTitle,
    cited_page_number: best.pageStart ?? null,
    run_outcome: "answered_partial",
  };
}

function saveConversationLog(params: {
  techId?: string;
  techName?: string;
  jobId?: string;
  jobNumber?: string;
  fireplace?: string;
  messages: ChatMessage[];
  assistantMessage: string;
}) {
  saveGabeMessage({
    techId: params.techId,
    techName: params.techName,
    jobId: params.jobId,
    jobNumber: params.jobNumber,
    customerName: params.fireplace,
    fireplace: params.fireplace,
    messages: [
      ...params.messages.filter((m) => m.role !== "system").map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date().toISOString(),
      })),
      { role: "assistant" as const, content: params.assistantMessage, timestamp: new Date().toISOString() },
    ],
  });
}

async function persistRunMetadata(params: {
  response: OrchestratorResponse;
  question: string;
  jobId?: string;
  techId?: string;
}) {
  if (!process.env.DATABASE_URL) return;
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  await sql`create table if not exists gabe_run_metadata (id bigserial primary key, ts timestamptz not null default now(), payload jsonb not null)`;
  await sql`insert into gabe_run_metadata (payload) values (${JSON.stringify({
    conversationId: params.jobId ?? params.techId ?? null,
    jobId: params.jobId ?? null,
    technicianId: params.techId ?? null,
    question: params.question,
    selectedEngine: params.response.run.selectedEngine,
    certainty: params.response.run.certainty,
    runOutcome: params.response.run.runOutcome,
    truthAuditStatus: params.response.run.truthAuditStatus,
    sourceEvidenceStatus: params.response.run.sourceEvidenceStatus,
    confidence: params.response.confidence,
    validatorVersion: params.response.run.validatorVersion,
    diagnostics: params.response.run.diagnostics,
    sourceType: params.response.source_type,
    answer: params.response.answer,
  })}::jsonb)`;
}
