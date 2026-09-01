import { NextRequest, NextResponse } from "next/server";
import { expenseReceiptResponse } from "@/lib/expense-receipts";
import { getExpense, requireExpenseActor } from "@/lib/expense-store";
import { getOrCreateDefaultOrg } from "@/lib/org";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireExpenseActor();
    const org = await getOrCreateDefaultOrg();
    const { id } = await context.params;
    const expense = await getExpense(org.id, id);
    if (!expense) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    if (!actor.isOffice && expense.submittedByClerkUserId !== actor.clerkUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return expenseReceiptResponse({
      objectKey: expense.receiptObjectKey,
      fileName: expense.receiptFileName,
      contentType: expense.receiptContentType,
      byteSize: expense.receiptByteSize,
      checksum: expense.receiptChecksum,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt could not be opened";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Unauthorized" : message }, { status });
  }
}
