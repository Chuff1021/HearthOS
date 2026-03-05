import { NextRequest, NextResponse } from "next/server";
import { 
  getGabeMessages, 
  getGabeMessageById, 
  saveGabeMessage, 
  updateGabeMessage, 
  flagGabeMessage,
  deleteGabeMessage,
  getGabeMessageStats 
} from "@/lib/gabe-messages";
import { appendMemoryEvent } from "@/lib/long-term-memory";

// GET - Get messages with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const filters = {
      techId: searchParams.get("techId") || undefined,
      jobId: searchParams.get("jobId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      flagged: searchParams.get("flagged") === "true" ? true : searchParams.get("flagged") === "false" ? false : undefined,
    };

    // If requesting stats
    if (searchParams.get("stats") === "true") {
      const stats = await getGabeMessageStats();
      return NextResponse.json(stats);
    }

    // If requesting a specific message
    const id = searchParams.get("id");
    if (id) {
      const message = await getGabeMessageById(id);
      if (!message) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json(message);
    }

    // Get filtered messages
    const messages = await getGabeMessages(filters);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("Failed to get GABE messages:", err);
    return NextResponse.json({ error: "Failed to get messages" }, { status: 500 });
  }
}

// POST - Save a new message conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const newMessage = await saveGabeMessage({
      techId: body.techId,
      techName: body.techName,
      techEmail: body.techEmail,
      jobId: body.jobId,
      jobNumber: body.jobNumber,
      customerName: body.customerName,
      fireplace: body.fireplace,
      messages: body.messages,
      duration: body.duration,
    });

    appendMemoryEvent({
      entity: "gabe_message",
      action: "create",
      entityId: newMessage.id,
      summary: `GABE conversation saved (${newMessage.techName || 'Unknown Tech'})`,
      payload: { jobNumber: newMessage.jobNumber, turns: newMessage.messages.length },
    });

    return NextResponse.json({ message: newMessage }, { status: 201 });
  } catch (err) {
    console.error("Failed to save GABE message:", err);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}

// PUT - Update a message (rating, flagging)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Message ID required" }, { status: 400 });
    }

    // Handle flagging
    if (body.flag && body.flagReason) {
      const flagged = await flagGabeMessage(id, body.flagReason);
      if (!flagged) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ message: flagged });
    }

    // Handle regular updates
    const updated = await updateGabeMessage(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (body.verdict && ['correct','incorrect','needs correction'].includes(body.verdict)) {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
        const lastUser = (updated.messages || []).filter((m) => m.role === 'user').slice(-1)[0]?.content || '';
        const lastAssistant = (updated.messages || []).filter((m) => m.role === 'assistant').slice(-1)[0]?.content || '';
        await fetch(`${base.replace(/\/$/, '')}/api/gabe/qa-memory`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            question: lastUser,
            normalizedQuestion: lastUser,
            model: updated.fireplace || updated.jobNumber || undefined,
            answer: lastAssistant,
            sourceUrls: [],
            sourcePages: [],
            verdict: body.verdict,
            technicianNotes: body.technicianNotes || updated.flagReason || '',
          }),
        });
      } catch {
        // non-fatal
      }
    }

    return NextResponse.json({ message: updated });
  } catch (err) {
    console.error("Failed to update GABE message:", err);
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}

// DELETE - Delete a message
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Message ID required" }, { status: 400 });
    }

    const deleted = await deleteGabeMessage(id);
    if (!deleted) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete GABE message:", err);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
