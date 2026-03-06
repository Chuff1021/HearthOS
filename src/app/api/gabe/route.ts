import { NextRequest, NextResponse } from "next/server";
import { buildGabeSystemPrompt } from "@/lib/gabe/prompts";
import { listManuals, listManualSections } from "@/lib/manuals";
import { saveGabeMessage } from "@/lib/gabe-messages";
import { appendMemoryEvent } from "@/lib/long-term-memory";
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

async function appendRunMetadataLocal(payload: Record<string, unknown>) {
  if (!process.env.DATABASE_URL) return;
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  await sql`create table if not exists gabe_run_metadata (id bigserial primary key, ts timestamptz not null default now(), payload jsonb not null)`;
  await sql`insert into gabe_run_metadata (payload) values (${JSON.stringify(payload)}::jsonb)`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages: ChatMessage[];
      jobContext?: {
        fireplace?: string;
        customerName?: string;
        jobType?: string;
        jobId?: string;
      };
      techId?: string;
      techName?: string;
      techEmail?: string;
    };

    const { messages, jobContext, techId, techName, techEmail } = body;
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
    const primaryUrl = orchestratorUrl || engineUrl;
    const engineRequired = (process.env.GABE_ENGINE_REQUIRED ?? "true").toLowerCase() === "true";

    if (primaryUrl && lastUserMessage) {
      let engineRes: Response;
      try {
        engineRes = await fetch(`${primaryUrl.replace(/\/$/, "")}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: lastUserMessage }),
        });
      } catch (e) {
        console.error("GABE upstream unavailable:", e);
        await appendRunMetadataLocal({
          question: lastUserMessage,
          source_type: 'none',
          certainty: 'Unverified',
          run_outcome: 'source_evidence_missing',
          validator_notes: ['upstream_unavailable'],
        });
        return NextResponse.json({
          answer: "Verified source evidence is currently unavailable.",
          source_type: "none",
          confidence: 0,
          certainty: "Unverified",
          run_outcome: "source_evidence_missing",
          no_answer_reason: "source_evidence_missing",
          validator_version: "v1",
        });
      }

      if (!engineRes.ok) {
        const error = await engineRes.text();
        console.error("GABE engine error:", error);
        await appendRunMetadataLocal({
          question: lastUserMessage,
          source_type: 'none',
          certainty: 'Unverified',
          run_outcome: 'source_evidence_missing',
          validator_notes: ['upstream_not_ok'],
        });
        return NextResponse.json({
          answer: "Verified source evidence is currently unavailable.",
          source_type: "none",
          confidence: 0,
          certainty: "Unverified",
          run_outcome: "source_evidence_missing",
          no_answer_reason: "source_evidence_missing",
          validator_version: "v1",
        });
      } else {
        const data = await engineRes.json();
        const assistantMessage = data?.answer ?? data?.message ?? "";

        try {
          const saved = await saveGabeMessage({
            techId,
            techName,
            techEmail,
            jobId,
            jobNumber,
            customerName: jobContext?.customerName,
            fireplace: jobContext?.fireplace,
            messages: [
              ...messages.filter((m) => m.role !== "system").map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
                timestamp: new Date().toISOString(),
              })),
              { role: "assistant" as const, content: assistantMessage, timestamp: new Date().toISOString() },
            ],
          });
          appendMemoryEvent({
            entity: "gabe_message",
            action: "create",
            entityId: saved.id,
            summary: `GABE conversation saved (${saved.techName || 'Unknown Tech'})`,
            payload: { jobNumber: saved.jobNumber, turns: saved.messages.length },
          });
        } catch (e) {
          console.error("Failed to save message log:", e);
        }

        await appendRunMetadataLocal({
          question: lastUserMessage,
          source_type: data?.source_type || 'none',
          certainty: data?.certainty || 'Unverified',
          run_outcome: data?.run_outcome || (data?.certainty === 'Verified Exact' ? 'answered_verified' : data?.certainty ? 'answered_partial' : 'refused_unverified'),
          validator_notes: data?.validator_notes || [],
          selected_engine: data?.selected_engine || null,
        });

        return NextResponse.json(data);
      }
    }

    if (engineRequired) {
      return NextResponse.json({
        answer: "GABE routing is required but neither GABE_ORCHESTRATOR_URL nor GABE_ENGINE_URL is configured.",
        source_type: "none",
        confidence: 0,
        no_answer_reason: "engine_not_configured"
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
        const saved = await saveGabeMessage({
          techId,
          techName,
          techEmail,
          jobId,
          jobNumber,
          customerName: jobContext?.customerName,
          fireplace: jobContext?.fireplace,
          messages: [
            ...messages.filter((m) => m.role !== "system").map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date().toISOString(),
            })),
            { role: "assistant" as const, content: fallbackResponse, timestamp: new Date().toISOString() },
          ],
        });
        appendMemoryEvent({
          entity: "gabe_message",
          action: "create",
          entityId: saved.id,
          summary: `GABE conversation saved (${saved.techName || 'Unknown Tech'})`,
          payload: { jobNumber: saved.jobNumber, turns: saved.messages.length },
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

    const manualsForPrompt = (matchedManuals.length > 0 ? matchedManuals : allManuals).slice(0, 25);
    const manualIds = new Set(manualsForPrompt.map((m) => m.id));
    const allSections = await listManualSections();
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
      const saved = await saveGabeMessage({
        techId,
        techName,
        techEmail,
        jobId,
        jobNumber,
        customerName: jobContext?.customerName,
        fireplace: jobContext?.fireplace,
        messages: [
          ...messages.filter((m) => m.role !== "system").map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date().toISOString(),
          })),
          { role: "assistant" as const, content: assistantMessage, timestamp: new Date().toISOString() },
        ],
      });
      appendMemoryEvent({
        entity: "gabe_message",
        action: "create",
        entityId: saved.id,
        summary: `GABE conversation saved (${saved.techName || 'Unknown Tech'})`,
        payload: { jobNumber: saved.jobNumber, turns: saved.messages.length },
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
