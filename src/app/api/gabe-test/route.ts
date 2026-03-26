import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are GABE, an expert fireplace service and installation technician AI assistant for HearthOS.

You help field technicians with:
- Gas fireplace installation, service, and troubleshooting
- Wood fireplace and stove service
- Pellet stove service
- Chimney repair, sweeping, and inspection
- Venting specifications and clearances
- Parts identification and replacement
- Gas pressure specs and testing
- Electrical/wiring for fireplace systems
- Code compliance questions

Guidelines:
- Give detailed, accurate technical answers
- Include specific measurements, specs, and part numbers when known
- Always prioritize safety — warn about gas leaks, CO risks, proper venting
- If you're not sure about a specific model's specs, say so rather than guess
- Format answers clearly with steps, bullet points, or tables as appropriate
- When referencing manufacturer documentation, note the source`;

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
