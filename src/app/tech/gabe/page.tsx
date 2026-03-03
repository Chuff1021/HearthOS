"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { manualKnowledgeBase } from "@/lib/gabe/prompts";
import TechBottomNav from "@/components/tech/TechBottomNav";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  meta?: {
    sourceType?: "manual" | "web" | "none";
    manualTitle?: string;
    pageNumber?: number;
    sourceUrl?: string;
    section?: string;
    confidence?: number;
  };
}

// ─── GABE Knowledge Base ───────────────────────────────────────────────────
// In production: replace getGabeResponse() with a real API call to
// OpenAI / Anthropic / Groq (cheap option) with a system prompt that
// includes the job context and uploaded manuals as RAG context.
//
// Recommended cheap API: Groq (llama-3.1-8b-instant) — ~$0.05/1M tokens
// System prompt template is exported below for easy wiring.
// ──────────────────────────────────────────────────────────────────────────

export function buildGabeSystemPrompt(jobContext?: {
  fireplace?: string;
  jobType?: string;
  jobId?: string;
}) {
  const contextBlock = jobContext?.fireplace
    ? `
## Current Job Context
The technician is currently on a job. Use this context to give specific, relevant answers:
- **Fireplace Unit**: ${jobContext.fireplace}
- **Job Type**: ${jobContext.jobType || "Service Call"}
- **Job ID**: ${jobContext.jobId || "Unknown"}

Always reference the specific unit when answering. If you know the model, reference its manual specs.
`
    : "";

  return `You are GABE (Gas Appliance & Burner Expert), an AI assistant for HearthOS — a field service management platform for fireplace installation and service companies.

## Your Role
You are a highly experienced fireplace technician with 20+ years of expertise in:
- Gas fireplace installation, service, and repair
- Direct vent, B-vent, and vent-free systems
- Brands: Regency, Napoleon, Heatilator, Heat & Glo, Majestic, Mendota, Valor, Fireplace Xtrordinair
- Gas line sizing, venting calculations, clearance requirements
- Troubleshooting: pilot issues, ignition, thermocouples, thermopiles, gas valves
- Safety: CO detection, gas leak testing, proper combustion
- Parts identification and pricing

## Guidelines
- Give direct, actionable answers — technicians are in the field
- Use numbered steps for procedures
- Include part numbers or specs when relevant
- Flag safety concerns prominently with ⚠️
- Reference manufacturer specs when possible
- Keep answers concise but complete
- If unsure, say so and recommend consulting the manual or manufacturer
${contextBlock}
## Uploaded Manuals
When a technician uploads a manual, you will have access to its content to answer model-specific questions. Reference the manual when answering questions about that specific unit.

Always end troubleshooting answers with: "Need more help? Ask me to walk through it step by step."`;
}

const gabeResponses: Record<string, string> = {
  pilot: "For pilot light issues, check these in order:\n\n1. **Gas Supply** — Verify gas valve is ON at the unit and at the main\n2. **Thermocouple** — Clean the tip with fine sandpaper, check connection\n3. **Thermopile** — Should generate 500–750mV when heated\n4. **Air in Line** — If new install, may need to bleed the gas line\n5. **Spark Igniter** — Check gap (1/8\") and for spark at pilot\n\n⚠️ If you smell gas, shut off supply and ventilate before proceeding.\n\nCommon fix: Thermocouple replacement ($15–30 in parts, 15–30 min labor).\n\nNeed more help? Ask me to walk through it step by step.",
  thermocouple: "**Thermocouple Testing:**\n\n1. **Visual Check** — Look for soot, corrosion, or damage\n2. **Millivolt Test** — Should read 15–30mV when heated\n3. **Connection** — Ensure tight connection to gas valve\n\n**Replacement Steps:**\n1. Turn off gas supply\n2. Remove old thermocouple from pilot assembly\n3. Install new one (universal fit, typically 24\"–36\")\n4. Tighten connection finger-tight + 1/4 turn\n5. Re-light pilot and hold for 60 seconds\n\nPart cost: $15–30 | Labor: 15–30 min\n\nNeed more help? Ask me to walk through it step by step.",
  thermopile: "**Thermopile Testing:**\n\n1. **Millivolt Test** — Should read 300–750mV when fully heated (allow 3–5 min)\n2. **Under Load Test** — Connect millivolt meter with valve switch ON; should stay above 250mV\n3. **Wiring** — Check connections at gas valve (TH/TP terminals)\n\n**Common Causes of Low mV:**\n- Dirty or corroded thermopile tip\n- Pilot flame not fully engulfing thermopile\n- Weak pilot flame (check orifice)\n- Failing thermopile (replace if under 300mV)\n\nReplacement: $35–55 in parts | 20–40 min labor\n\nNeed more help? Ask me to walk through it step by step.",
  venting: "**Gas Fireplace Venting Requirements:**\n\n**Direct Vent (most common):**\n- Co-linear venting for existing chimneys\n- Horizontal termination: min 12\" from window/door\n- Vertical: 3' above roof penetration, 2' above anything within 10'\n\n**Vent-Free:**\n- No venting required\n- Must have adequate room ventilation (min 50 cu ft per 1,000 BTU)\n- ⚠️ Not allowed in bedrooms, bathrooms, or rooms under 100 sq ft\n\n**B-Vent:**\n- Natural draft venting\n- Must terminate 3' above roof\n- Requires 1\" clearance to combustibles\n\n⚠️ Always check local codes — they may exceed manufacturer specs.\n\nNeed more help? Ask me to walk through it step by step.",
  remote: "**Remote Control Troubleshooting:**\n\n1. **Batteries** — Replace in both remote and receiver (fresh alkaline)\n2. **Receiver Location** — Keep away from heat sources, check mounting\n3. **Signal Test** — Press button, look for LED flash on receiver\n4. **Learn Function** — May need to re-pair: hold LEARN button on receiver until LED flashes, then press remote button\n5. **Wiring** — Check connections at gas valve (TH terminals)\n\n**Smart Home Integration:**\nMost units support 24V thermostat wiring. Check for TH/TP terminals on the gas valve.\n\nNeed more help? Ask me to walk through it step by step.",
  cleaning: "**Gas Fireplace Cleaning Procedure:**\n\n**Glass Cleaning:**\n1. Wait until completely cool (30+ min)\n2. Remove glass frame/door\n3. Use gas fireplace glass cleaner (NOT regular glass cleaner — will etch)\n4. White haze is normal — from combustion byproducts\n5. Reinstall glass with gasket properly seated\n\n**Interior Cleaning:**\n1. Vacuum burner ports gently with soft brush\n2. Clean ember material (replace if deteriorated or discolored)\n3. Check log placement per manufacturer diagram\n4. Inspect for rust or corrosion\n5. Clean pilot assembly with compressed air\n\nService interval: Annual inspection recommended\n\nNeed more help? Ask me to walk through it step by step.",
  installation: "**Gas Fireplace Installation Checklist:**\n\n**Pre-Install:**\n✓ Verify gas line size (1/2\" min for most units, 3/4\" for high BTU)\n✓ Check clearances to combustibles (see rating plate)\n✓ Confirm electrical available (for fan/ignition)\n✓ Verify venting path is clear\n✓ Confirm unit matches order (model, fuel type, BTU)\n\n**During Install:**\n✓ Level unit and secure in place\n✓ Connect gas with approved fittings (no Teflon tape on flare fittings)\n✓ Install venting per manufacturer specs\n✓ Connect electrical (if required)\n✓ ⚠️ Test for gas leaks with soap solution or electronic detector\n\n**Post-Install:**\n✓ Light pilot and verify operation\n✓ Check all flame patterns\n✓ Test fan/remote\n✓ Review operation with customer\n✓ Leave manual and warranty info with customer\n\nNeed more help? Ask me to walk through it step by step.",
  noise: "**Gas Fireplace Noise Diagnosis:**\n\n**Whistling:**\n- Gas pressure too high (check with manometer)\n- Restricted gas line or orifice\n- Dirty burner ports\n\n**Rumbling/Roaring:**\n- Improper gas pressure\n- Loose components vibrating\n- Fan motor issues\n\n**Clicking:**\n- Normal during ignition (3–5 clicks)\n- If continuous: igniter gap too wide or wet\n- Expansion/contraction: normal during heat-up/cool-down\n\n**Fan Noise:**\n- Clean fan blades (dust buildup causes imbalance)\n- Check mounting screws\n- Variable speed may cause hum at low settings\n\n⚠️ Always check gas pressure with manometer — should match rating plate.\n\nNeed more help? Ask me to walk through it step by step.",
  pipe: "**Gas Pipe Sizing Guide:**\n\n**Common Residential Sizing:**\n| BTU Input | Pipe Size | Max Run |\n|-----------|-----------|----------|\n| Up to 50K | 1/2\" | 30 ft |\n| 50K–100K | 3/4\" | 50 ft |\n| 100K–200K | 1\" | 75 ft |\n\n**Flex Connector:**\n- Use corrugated stainless steel (CSST) or appliance connector\n- Max 6 ft for appliance connectors\n- CSST requires bonding per local code\n\n**Venting Pipe:**\n- Match pipe diameter to unit collar (typically 4\" or 6\")\n- Use manufacturer-approved pipe only (co-axial for direct vent)\n- Max horizontal run: check manufacturer specs (typically 10–20 ft)\n- Each 90° elbow = 5 ft equivalent length\n\n⚠️ Never mix pipe brands on direct vent systems.\n\nNeed more help? Ask me to walk through it step by step.",
  regency: "**Regency Fireplace — Common Service Notes:**\n\n**F1100 Gas Insert:**\n- Pilot: IPI (Intermittent Pilot Ignition) — normal to click 3–5x before lighting\n- Thermopile: Should read 450–650mV when hot\n- Glass: Use Regency-approved cleaner only\n- Venting: 4\" co-linear or 4\"×6.5\" co-axial\n- BTU: 26,000 (high) / 16,000 (low)\n\n**P33 / P36 Gas Insert:**\n- Uses SIT Nova gas valve\n- Thermopile target: 500–700mV\n- Common issue: ODS (Oxygen Depletion Sensor) tripping — check room ventilation\n\n**General Regency Tips:**\n- Parts available at regency-fire.com or through distributor\n- Tech support: 1-800-268-4328\n\nNeed more help? Ask me to walk through it step by step.",
  default: `🔥 I'm **GABE**, your Fireplace Expert AI assistant!

I can help with:

• **Troubleshooting** — Pilot issues, ignition problems, noise
• **Installation** — Venting requirements, clearances, gas sizing
• **Service** — Cleaning, maintenance, inspections
• **Parts** — Thermocouples, remotes, blowers, glass
• **Safety** — CO detection, gas leaks, proper operation
• **Pipe Sizing** — Gas line and vent pipe calculations

📖 **I have ${manualKnowledgeBase.includes('Majestic') ? '50+' : ''} fireplace manuals available!**
Ask me about specific models like:
- Majestic: Ashland, Jade, Meridian, Ruby, Biltmore, Cameo, Carolina
- And many more with PDF installation guides

Just ask your question and I'll provide expert guidance. If you're on a job, I already know what unit you're working on!`
};

function getGabeResponse(query: string, jobContext?: { fireplace?: string; jobType?: string }): string {
  const lowerQuery = query.toLowerCase();

  // Job-context-aware responses
  if (jobContext?.fireplace && (lowerQuery.includes("this unit") || lowerQuery.includes("this fireplace") || lowerQuery.includes("what am i working on"))) {
    return `You're currently working on a **${jobContext.fireplace}** (${jobContext.jobType || "service call"}).\n\n${
      jobContext.fireplace.toLowerCase().includes("regency") ? gabeResponses.regency : 
      "I have general knowledge about this unit type. Ask me anything specific about it — pilot, venting, parts, or troubleshooting."
    }`;
  }

  if (lowerQuery.includes("pilot") || lowerQuery.includes("won't light") || lowerQuery.includes("wont light") || lowerQuery.includes("won t light")) {
    return gabeResponses.pilot;
  }
  if (lowerQuery.includes("thermopile")) {
    return gabeResponses.thermopile;
  }
  if (lowerQuery.includes("thermocouple")) {
    return gabeResponses.thermocouple;
  }
  if (lowerQuery.includes("vent") || lowerQuery.includes("venting") || lowerQuery.includes("chimney") || lowerQuery.includes("flue")) {
    return gabeResponses.venting;
  }
  if (lowerQuery.includes("remote") || lowerQuery.includes("thermostat") || lowerQuery.includes("control") || lowerQuery.includes("receiver")) {
    return gabeResponses.remote;
  }
  if (lowerQuery.includes("clean") || lowerQuery.includes("glass") || lowerQuery.includes("maintenance") || lowerQuery.includes("service")) {
    return gabeResponses.cleaning;
  }
  if (lowerQuery.includes("install") || lowerQuery.includes("clearance") || lowerQuery.includes("gas line") || lowerQuery.includes("hook up")) {
    return gabeResponses.installation;
  }
  if (lowerQuery.includes("noise") || lowerQuery.includes("sound") || lowerQuery.includes("whistl") || lowerQuery.includes("rumbl") || lowerQuery.includes("click")) {
    return gabeResponses.noise;
  }
  if (lowerQuery.includes("pipe") || lowerQuery.includes("sizing") || lowerQuery.includes("flex") || lowerQuery.includes("liner") || lowerQuery.includes("how much pipe")) {
    return gabeResponses.pipe;
  }
  if (lowerQuery.includes("regency") || lowerQuery.includes("f1100") || lowerQuery.includes("p33") || lowerQuery.includes("p36")) {
    return gabeResponses.regency;
  }

  return gabeResponses.default;
}

// ─── Inner component that uses useSearchParams ─────────────────────────────
function GABEInner() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId") || undefined;
  const fireplace = searchParams.get("fireplace") || undefined;
  const jobType = searchParams.get("jobType") || undefined;

  const jobContext = fireplace ? { fireplace, jobType, jobId } : undefined;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: jobContext?.fireplace
        ? `🔥 Hey! I'm **GABE**, your Fireplace Expert AI.\n\nI can see you're working on a **${jobContext.fireplace}** (${jobContext.jobType || "service call"}). I'll keep that in mind for all my answers.\n\nWhat do you need help with?`
        : "🔥 Hey there! I'm **GABE**, your Fireplace Expert AI assistant.\n\nI'm here to help with any service or installation questions. Need help troubleshooting a pilot light? Figuring out venting requirements? Just ask!\n\nWhat can I help you with today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(100);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (overrideInput?: string) => {
    const text = overrideInput ?? input;
    if (!text.trim()) return;

    msgCounter.current += 2;
    const userMessage: Message = {
      id: msgCounter.current.toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Call real GABE AI API (Groq llama-3.1-8b-instant)
    try {
      const apiMessages = messages
        .filter((m) => m.id !== "1") // Skip the initial greeting
        .map((m) => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: "user", content: text });

      const res = await fetch("/api/gabe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, jobContext }),
      });

      let responseText: string;
      let responseMeta: Message["meta"] | undefined;
      if (res.ok) {
        const data = await res.json() as any;
        if (data?.answer) {
          responseText = data.answer;
          responseMeta = {
            sourceType: data.source_type,
            manualTitle: data.manual_title,
            pageNumber: data.page_number,
            sourceUrl: data.source_url || data.url,
            section: data.section,
            confidence: data.confidence,
          };
        } else {
          responseText = data.message ?? "No response from AI";
        }
      } else {
        // Fallback to local responses if API fails
        responseText = getGabeResponse(text, jobContext);
      }

      const assistantMessage: Message = {
        id: (msgCounter.current + 1).toString(),
        role: "assistant",
        content: responseText,
        timestamp: new Date(),
        meta: responseMeta,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      // Fallback to local responses on network error
      const response = getGabeResponse(text, jobContext);
      const assistantMessage: Message = {
        id: (msgCounter.current + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  // Context-aware quick questions
  const quickQuestions = jobContext?.fireplace
    ? [
        `What am I working on?`,
        "Pilot light won't stay lit",
        "Thermocouple testing",
        "Venting requirements",
        "How much pipe do I need?",
        "Cleaning procedure",
      ]
    : [
        "Pilot light won't stay lit",
        "Thermocouple testing",
        "Venting requirements",
        "Remote not working",
        "Cleaning procedure",
        "Installation checklist",
        "How much pipe do I need?",
      ];

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Header */}
      <header className="bg-[var(--color-surface-1)] p-4 sticky top-0 z-10 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link href={jobId ? `/tech/job/${jobId}` : "/tech"} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center">
              <span className="text-lg">🔥</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">GABE</h1>
              <p className="text-xs text-gray-400">Fireplace Expert AI</p>
            </div>
          </div>
          {/* Job context badge */}
          {jobContext?.fireplace && (
            <div className="bg-blue-600/20 border border-blue-600/40 rounded-lg px-2 py-1 max-w-[120px]">
              <p className="text-xs text-blue-600 truncate font-medium">{jobContext.fireplace}</p>
              <p className="text-xs text-gray-500 truncate">{jobContext.jobType}</p>
            </div>
          )}
        </div>
      </header>

      {/* Job Context Banner */}
      {jobContext?.fireplace && (
        <div className="bg-blue-600/10 border-b border-blue-600/20 px-4 py-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-blue-700">
            GABE knows you&apos;re working on a <span className="font-semibold">{jobContext.fireplace}</span>
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                <span className="text-xs">🔥</span>
              </div>
            )}
            <div
              className={`max-w-[82%] rounded-2xl p-3 ${
                message.role === "user"
                  ? "bg-blue-600 text-white rounded-br-md"
                  : "bg-[var(--color-surface-1)] text-white rounded-bl-md"
              }`}
            >
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>
              {message.role === "assistant" && message.meta?.sourceType && (
                <div className="mt-2 text-xs text-gray-400 space-y-1">
                  <div>Source: {message.meta.sourceType}</div>
                  {message.meta.sourceType === "manual" && (
                    <div>
                      {message.meta.manualTitle ? `${message.meta.manualTitle}` : "Manual"}{" "}
                      {message.meta.pageNumber ? `p. ${message.meta.pageNumber}` : ""}
                      {message.meta.sourceUrl && (
                        <>
                          {" "}
                          —{" "}
                          <a
                            className="text-blue-600 underline"
                            href={message.meta.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Manual Link
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {message.meta.sourceType === "web" && (
                    <div>
                      {message.meta.section ? `${message.meta.section}` : "Manufacturer Website"}{" "}
                      {message.meta.sourceUrl && (
                        <>
                          {" "}
                          —{" "}
                          <a
                            className="text-blue-600 underline"
                            href={message.meta.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Source Link
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {typeof message.meta.confidence === "number" && (
                    <div>Confidence: {message.meta.confidence}</div>
                  )}
                </div>
              )}
              <p className="text-xs opacity-40 mt-1.5">
                {message.timestamp.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-1">
              <span className="text-xs">🔥</span>
            </div>
            <div className="bg-[var(--color-surface-1)] rounded-2xl rounded-bl-md p-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-400 mb-2">Quick questions:</p>
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => handleSend(q)}
                className="bg-[var(--color-surface-1)] px-3 py-1.5 rounded-full text-xs text-gray-300 border border-gray-700 hover:border-blue-600 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-16 bg-[var(--color-bg)] p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={jobContext?.fireplace ? `Ask about the ${jobContext.fireplace}...` : "Ask GABE anything..."}
            className="flex-1 bg-[var(--color-surface-1)] rounded-xl px-4 py-3 text-sm border border-gray-700 focus:border-blue-600 outline-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 rounded-xl disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        {/* API integration hint */}
        <p className="text-xs text-gray-600 mt-2 text-center">
          Powered by HearthOS AI · Connect Groq/OpenAI for live responses
        </p>
      </div>

      <TechBottomNav active="gabe" />
    </div>
  );
}

// ─── Page wrapper with Suspense (required for useSearchParams) ─────────────
export default function GABEPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg)]">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔥</span>
          </div>
          <p className="text-gray-400">Loading GABE...</p>
        </div>
      </div>
    }>
      <GABEInner />
    </Suspense>
  );
}
