import { NextRequest, NextResponse } from "next/server";
import { buildGabeSystemPrompt } from "@/lib/gabe/prompts";
import { listManuals, listManualSections } from "@/lib/manuals";
import { saveGabeMessage } from "@/lib/gabe-messages";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages: ChatMessage[];
      jobContext?: {
        fireplace?: string;
        jobType?: string;
        jobId?: string;
      };
      techId?: string;
      techName?: string;
    };

    const { messages, jobContext, techId, techName } = body;
    const jobId = jobContext?.jobId;
    const jobNumber = jobContext?.jobId ? `JOB-2026-${jobContext.jobId.split("-").pop()}` : undefined;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content;
    const engineUrl = process.env.GABE_ENGINE_URL;

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
          answer: "This information is not available in verified manufacturer documentation.",
          source_type: "none",
          confidence: 0
        });
      } else {
        const data = await engineRes.json();
        const assistantMessage = data?.answer ?? data?.message ?? "";

        try {
          saveGabeMessage({
            techId,
            techName,
            jobId,
            jobNumber,
            customerName: jobContext?.fireplace,
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
        } catch (e) {
          console.error("Failed to save message log:", e);
        }

        return NextResponse.json(data);
      }
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
        saveGabeMessage({
          techId,
          techName,
          jobId,
          jobNumber,
          customerName: jobContext?.fireplace,
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
      saveGabeMessage({
        techId,
        techName,
        jobId,
        jobNumber,
        customerName: jobContext?.fireplace,
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
