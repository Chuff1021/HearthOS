import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCustomerById } from "@/lib/data-store";
import {
  createExpense,
  listExpenses,
  requireExpenseActor,
  updateExpenseStatus,
  type ExpenseAllocation,
  type ExpenseStatus,
} from "@/lib/expense-store";
import { deleteExpenseReceipt, storeExpenseReceipt } from "@/lib/expense-receipts";
import { getOrCreateDefaultOrg } from "@/lib/org";

const EXPENSE_STATUSES = new Set<ExpenseStatus>(["submitted", "approved", "reimbursed", "rejected"]);
const ALLOCATIONS = new Set<ExpenseAllocation>(["customer", "stock_shop"]);

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Expense request failed";
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireExpenseActor();
    const org = await getOrCreateDefaultOrg();
    const requestedScope = request.nextUrl.searchParams.get("scope") || (actor.isOffice ? "all" : "mine");
    if (requestedScope === "all" && !actor.isOffice) {
      return NextResponse.json({ error: "Office access is required" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status");
    const allocation = request.nextUrl.searchParams.get("allocation");
    const expenses = await listExpenses({
      orgId: org.id,
      actor,
      mineOnly: requestedScope !== "all",
      status: status && EXPENSE_STATUSES.has(status as ExpenseStatus) ? status : null,
      allocation: allocation && ALLOCATIONS.has(allocation as ExpenseAllocation) ? allocation : null,
      query: request.nextUrl.searchParams.get("q"),
    });

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const summary = expenses.reduce((totals, expense) => {
      totals.total += expense.amount;
      if (expense.status === "submitted") {
        totals.pendingAmount += expense.amount;
        totals.pendingCount += 1;
      }
      if (expense.expenseDate.startsWith(monthKey)) totals.monthTotal += expense.amount;
      if (expense.allocationType === "stock_shop") totals.stockShopTotal += expense.amount;
      return totals;
    }, { total: 0, pendingAmount: 0, pendingCount: 0, monthTotal: 0, stockShopTotal: 0 });

    return NextResponse.json({ expenses, summary, canReview: actor.isOffice });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  let storedObjectKey: string | null = null;
  try {
    const actor = await requireExpenseActor();
    const org = await getOrCreateDefaultOrg();
    const form = await request.formData();
    const file = form.get("receipt");
    const allocationType = String(form.get("allocationType") || "") as ExpenseAllocation;
    const customerId = String(form.get("customerId") || "").trim() || null;
    const merchant = String(form.get("merchant") || "").trim();
    const category = String(form.get("category") || "Other").trim().slice(0, 60);
    const expenseDate = String(form.get("expenseDate") || "").trim();
    const notes = String(form.get("notes") || "").trim().slice(0, 2000) || null;
    const amount = Number(form.get("amount"));

    if (!(file instanceof File)) throw new Error("A receipt photo or PDF is required.");
    if (!ALLOCATIONS.has(allocationType)) throw new Error("Choose a customer or Stock / Shop.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) throw new Error("Choose a valid expense date.");
    if (!merchant) throw new Error("Merchant is required.");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error("Enter a valid expense amount.");

    let customerName: string | null = null;
    if (allocationType === "customer") {
      if (!customerId) throw new Error("Select the customer this expense belongs to.");
      const customer = await getCustomerById(customerId);
      if (!customer) throw new Error("The selected customer could not be verified.");
      customerName = customer.displayName;
    }

    const id = randomUUID();
    const receipt = await storeExpenseReceipt({ expenseId: id, orgId: org.id, file });
    storedObjectKey = receipt.objectKey;
    const expense = await createExpense({
      id,
      orgId: org.id,
      actor,
      expenseDate,
      merchant,
      amount: Math.round(amount * 100) / 100,
      category,
      allocationType,
      customerId: allocationType === "customer" ? customerId : null,
      customerName,
      notes,
      receipt,
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    if (storedObjectKey) await deleteExpenseReceipt(storedObjectKey).catch(() => undefined);
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireExpenseActor();
    if (!actor.isOffice) return NextResponse.json({ error: "Office access is required" }, { status: 403 });
    const org = await getOrCreateDefaultOrg();
    const body = await request.json();
    const id = String(body.id || "");
    const status = String(body.status || "") as ExpenseStatus;
    if (!id || !EXPENSE_STATUSES.has(status)) {
      return NextResponse.json({ error: "A valid expense and status are required" }, { status: 400 });
    }
    const expense = await updateExpenseStatus({ orgId: org.id, id, status, actor });
    if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    return NextResponse.json({ expense });
  } catch (error) {
    return errorResponse(error);
  }
}
