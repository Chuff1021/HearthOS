import { NextRequest, NextResponse } from "next/server";
import { createManualSection } from "@/lib/manuals";
import postgres from "postgres";

const NEMO_MODEL = "nvidia/nemoretriever-parse";
const VISION_MODEL = "moonshotai/kimi-k2.5";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MIN_TEXT_FOR_DIAGRAM = 100; // chars — below this, page is likely a diagram

export async function POST(request: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { manualId, pageNumber, imageBase64 } = await request.json();

    if (!manualId || !pageNumber || !imageBase64) {
      return NextResponse.json(
        { error: "manualId, pageNumber, and imageBase64 are required" },
        { status: 400 }
      );
    }

    // Step 1: Extract text/tables via NemoRetriever Parse
    let nemoText = "";
    let contentTypes: string[] = [];

    try {
      const nemoRes = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: NEMO_MODEL,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${imageBase64}` },
                },
              ],
            },
          ],
          tools: [
            { type: "function", function: { name: "markdown_no_bbox" } },
          ],
        }),
      });

      if (nemoRes.ok) {
        const nemoData = await nemoRes.json();
        const toolCall = nemoData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            if (typeof parsed === "string") {
              nemoText = parsed;
            } else if (Array.isArray(parsed)) {
              nemoText = parsed.map((el: any) => el.text || "").join("\n\n");
              contentTypes = [...new Set(parsed.map((el: any) => el.type).filter(Boolean))];
            } else if (parsed.text) {
              nemoText = parsed.text;
            }
          } catch {
            nemoText = toolCall.function.arguments;
          }
        }
      } else {
        console.warn(`[INGEST] NemoRetriever failed for page ${pageNumber}:`, await nemoRes.text());
      }
    } catch (e) {
      console.warn(`[INGEST] NemoRetriever error for page ${pageNumber}:`, e);
    }

    // Step 2: If low text density, use Kimi K2.5 vision to read diagrams
    let diagramText = "";
    const isDiagramPage = nemoText.trim().length < MIN_TEXT_FOR_DIAGRAM;

    if (isDiagramPage) {
      try {
        const visionRes = await fetch(NVIDIA_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: VISION_MODEL,
            messages: [
              {
                role: "system",
                content: "detailed thinking off",
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "This is a page from a fireplace installation manual. Extract ALL text, measurements, dimensions, clearances, specifications, part numbers, and labels visible on this page. If there is a diagram, describe every labeled measurement with its value and units. Format as plain text, not markdown tables.",
                  },
                  {
                    type: "image_url",
                    image_url: { url: `data:image/png;base64,${imageBase64}` },
                  },
                ],
              },
            ],
            temperature: 0.2,
            max_tokens: 4096,
            stream: false,
          }),
        });

        if (visionRes.ok) {
          const visionData = await visionRes.json();
          let raw = visionData.choices?.[0]?.message?.content || "";
          // Strip <think> tags if present
          const thinkClose = raw.indexOf("</think>");
          if (thinkClose !== -1) {
            raw = raw.substring(thinkClose + "</think>".length).trim();
          }
          if (!raw) {
            raw = raw.replace(/<\/?think>/g, "").trim();
          }
          diagramText = raw;
          contentTypes.push("diagram");
        } else {
          console.warn(`[INGEST] Kimi vision failed for page ${pageNumber}:`, await visionRes.text());
        }
      } catch (e) {
        console.warn(`[INGEST] Kimi vision error for page ${pageNumber}:`, e);
      }
    }

    // Step 3: Combine and store
    const combinedContent = [nemoText, diagramText].filter(Boolean).join("\n\n---\n\n");

    if (!combinedContent.trim()) {
      return NextResponse.json({
        page: pageNumber,
        status: "skipped",
        reason: "No content extracted",
      });
    }

    // Delete existing section for this page (re-ingest support)
    if (process.env.DATABASE_URL) {
      try {
        const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
        await sql`DELETE FROM manual_sections WHERE manual_id = ${manualId} AND page_start = ${pageNumber}`;
        await sql.end();
      } catch {
        // non-fatal — section may not exist yet
      }
    }

    await createManualSection({
      manualId,
      pageStart: pageNumber,
      pageEnd: pageNumber,
      title: `Page ${pageNumber}`,
      snippet: combinedContent.slice(0, 10000), // cap at 10k chars per page
      tags: contentTypes.length > 0 ? contentTypes : ["text"],
    });

    return NextResponse.json({
      page: pageNumber,
      status: "ingested",
      textLength: nemoText.length,
      diagramLength: diagramText.length,
      isDiagramPage,
      contentTypes,
    });
  } catch (err) {
    console.error("[INGEST] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingestion failed" },
      { status: 500 }
    );
  }
}
