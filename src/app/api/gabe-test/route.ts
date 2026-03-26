import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are GABE, a senior fireplace technician with 20+ years of experience. You work alongside the field techs at a fireplace service company and they come to you with questions throughout the day.

Talk like a knowledgeable coworker — natural, conversational, helpful. Not like a manual or a corporate chatbot. Imagine you're texting a tech back while they're on a job site.

Your knowledge covers gas fireplaces, wood stoves, pellet stoves, chimney work, venting, electrical, parts, and code compliance.

How to respond:
- Be conversational and direct. Skip the headers, checklists, and formal formatting unless the tech specifically asks for a procedure or step-by-step.
- Lead with the answer, not the disclaimers. If they ask how to test a thermopile, start with how to test it.
- Use plain language. Say "you should see 300-750 millivolts" not "Expected reading: 300mV to 750mV".
- Keep it concise. Don't pad with sections they didn't ask for. If they want more detail, they'll ask.
- Include specific numbers — voltages, clearances, pressures, part numbers — when you know them.
- Only mention safety when it's genuinely relevant to what they're doing (gas leaks, CO risk, live electrical). Don't add generic safety warnings to every response.
- If you don't know a specific model's specs, say so honestly. Don't guess.
- Don't end every response asking for more info or listing follow-up options unless the question was genuinely ambiguous.`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: "NVIDIA_API_KEY is not configured",
        hint: "Add NVIDIA_API_KEY to Vercel environment variables",
      }, { status: 500 });
    }

    const model = process.env.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-ultra-253b-v1";

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "detailed thinking off" },
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 4096,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GABE-TEST] NVIDIA API error:", response.status, errorText);
      return NextResponse.json({
        error: `NVIDIA API returned ${response.status}`,
        details: errorText,
      }, { status: 502 });
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";

    // Nemotron Ultra puts reasoning in <think>...</think> then answer after.
    // If the entire response is wrapped in <think>, extract what's after the closing tag.
    // If there's no closing tag, the model may still be "thinking" — use the raw content.
    let answer = rawContent;
    const thinkClose = rawContent.indexOf("</think>");
    if (thinkClose !== -1) {
      answer = rawContent.substring(thinkClose + "</think>".length).trim();
    }
    // If stripping left nothing, fall back to the content inside <think> (better than empty)
    if (!answer) {
      answer = rawContent.replace(/<\/?think>/g, "").trim();
    }

    if (!answer) {
      return NextResponse.json({
        error: "Empty response from model",
        rawLength: rawContent.length,
        rawPreview: rawContent.substring(0, 200),
      }, { status: 500 });
    }

    return NextResponse.json({
      answer,
      model,
      usage: data.usage || null,
    });
  } catch (err) {
    console.error("[GABE-TEST] Unhandled error:", err);
    return NextResponse.json({
      error: "Server error",
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
