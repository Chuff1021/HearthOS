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
  const engineRequired = (process.env.GABE_ENGINE_REQUIRED ?? "true").toLowerCase() === "true";

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

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content;
    const orchestratorUrl = process.env.GABE_ORCHESTRATOR_URL;
    const engineUrl = process.env.GABE_ENGINE_URL;
    const engineRequired = (process.env.GABE_ENGINE_REQUIRED ?? "true").toLowerCase() === "true";

    // STRICT MANUAL GUARD:
    // When a manual is selected, only answer from that exact manual.
    if (selectedManual?.manualId && lastUserMessage) {
      const allManuals = await listManuals();
      const selectedManualRecord = allManuals.find((manual) => manual.id === selectedManual.manualId);

      if (!selectedManualRecord) {
        return NextResponse.json({
          answer: `I could not verify this answer in the selected manual${selectedManual.manualTitle ? ` (${selectedManual.manualTitle})` : ""}.`,
          source_type: "none",
          confidence: 0,
          selected_manual_id: selectedManual.manualId,
          selected_manual_title: selectedManual.manualTitle ?? null,
          answered_from_selected_manual: false,
          manual_title: selectedManual.manualTitle ?? null,
          page_number: null,
        });
      }

      const selectedSections = await listManualSections(selectedManual.manualId);
      const bestSection = pickBestManualSection(lastUserMessage, selectedSections);

      if (!bestSection) {
        return NextResponse.json({
          answer: `I could not verify this answer in the selected manual${selectedManual.manualTitle ? ` (${selectedManual.manualTitle})` : ""}.`,
          source_type: "none",
          confidence: 0,
          selected_manual_id: selectedManual.manualId,
          selected_manual_title: selectedManual.manualTitle ?? `${selectedManualRecord.brand} ${selectedManualRecord.model}`,
          answered_from_selected_manual: false,
          manual_title: selectedManual.manualTitle ?? `${selectedManualRecord.brand} ${selectedManualRecord.model}`,
          page_number: null,
        });
      }

      const selectedManualTitle = selectedManual.manualTitle ?? `${selectedManualRecord.brand} ${selectedManualRecord.model}`;
      const answer = buildStrictManualAnswer(lastUserMessage, bestSection);

      return NextResponse.json({
        answer,
        source_type: "manual",
        manual_title: selectedManualTitle,
        page_number: bestSection.pageStart ?? null,
        source_url: selectedManualRecord.url,
        confidence: 72,
        selected_manual_id: selectedManual.manualId,
        selected_manual_title: selectedManualTitle,
        answered_from_selected_manual: true,
        cited_manual_title: selectedManualTitle,
        cited_page_number: bestSection.pageStart ?? null,
        backend: "manual-guard",
      });
    }

    if (orchestratorUrl && lastUserMessage) {
      const orchestratorRes = await fetch(`${orchestratorUrl.replace(/\/$/, "")}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: lastUserMessage,
          conversationId: jobId ?? techId ?? undefined,
          selectedManualId: selectedManual?.manualId,
          selectedManualTitle: selectedManual?.manualTitle,
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

      if ((data.source_type === "none" || data.run.runOutcome === "refused_unverified") && lastUserMessage) {
        const fallback = await buildManualFallback(lastUserMessage, selectedManual?.manualId);
        if (fallback) {
          return NextResponse.json({ ...fallback, backend: "manual-fallback" });
        }
      }

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
        body: JSON.stringify({ question: lastUserMessage }),
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

      if ((data?.source_type === "none" || data?.run_outcome === "refused_unverified") && lastUserMessage) {
        const fallback = await buildManualFallback(lastUserMessage, selectedManual?.manualId);
        if (fallback) {
          return NextResponse.json({ ...fallback, backend: "manual-fallback" });
        }
      }

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

    const groqApiKey = process.env.GROQ_API_KEY;
    const modelOverride = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

    console.log("[GABE] GROQ_API_KEY present:", !!groqApiKey);
    console.log("[GABE] GROQ_MODEL:", modelOverride);

    const allManuals = await listManuals();

    if (!groqApiKey) {
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

      const fallbackResponse = `🔥 **GABE AI is not configured** — Missing GROQ_API_KEY environment variable.

**Current Status:** Key is ${groqApiKey ? "present but not working" : "NOT FOUND"}

To fix:

**📚 Manual Library Status:**
- **Total Manuals:** ${allManuals.length}
- **Brand Distribution:** ${brandSummary}

Here are the manuals I have access to:
${manualList}
${allManuals.length > 30 ? `\n...and ${allManuals.length - 30} more manuals` : ""}

---

**However, I can still help with common fireplace questions!**

**Pilot Light Issues:**
1. Check gas valve is ON at unit and main
2. Clean thermocouple tip with fine sandpaper
3. Thermopile should read 500–750mV when heated
4. Check for air in gas line (new installs)
5. Verify spark igniter gap (1/8")

**Thermocouple Testing:**
- Should read 15–30mV when heated
- Check connection to gas valve
- Replace if damaged ($15–30 parts)

**Thermopile Testing:**
- Should read 350–750mV when fully heated (3–5 min)
- Under load test: stay above 250mV
- Replace if under 300mV ($35–55 parts)

**Direct Vent Venting:**
- 4" inner, 6.5" outer co-axial pipe
- Horizontal: min 12" from window/door
- Vertical: 3' above roof penetration
- Each 90° elbow = 5 ft equivalent length

⚠️ **Safety First:** If you smell gas, shut off supply and ventilate before troubleshooting.

**To enable full AI responses:**
1. Go to https://console.groq.com to get a free API key
2. Add GROQ_API_KEY to your Vercel project settings (Environment Variables)
3. Redeploy the application

Would you like help with a specific fireplace model or issue?`;

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

    const selectedManualRecord = selectedManual?.manualId
      ? allManuals.find((manual) => manual.id === selectedManual.manualId)
      : undefined;
    const prioritizedManuals = selectedManualRecord
      ? [selectedManualRecord]
      : matchedManuals.length > 0
        ? matchedManuals
        : allManuals;

    const manualsForPrompt = prioritizedManuals.slice(0, 25);
    const manualIds = new Set(manualsForPrompt.map((m) => m.id));
    const allSections = selectedManualRecord
      ? await listManualSections(selectedManualRecord.id)
      : await listManualSections();
    const sectionsForPrompt = allSections
      .filter((s) => manualIds.has(s.manualId))
      .slice(0, 200);

    const systemPrompt = buildGabeSystemPrompt(jobContext, {
      manuals: manualsForPrompt,
      sections: sectionsForPrompt,
    });

    console.log("[GABE] Calling Groq API with", messages.length, "messages");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelOverride,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.3,
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Groq API error:", error);

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
        isKeyConfigured: !!groqApiKey,
        isAuthError,
        details: error,
      }, { status: isAuthError ? 401 : 503 });
    }

    const data = await response.json() as GroqResponse;
    const assistantMessage = data.choices[0]?.message?.content;

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
