import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { readDb } from "@/lib/mock/db";
import { getCustomerRequestDetail } from "@/lib/mock/repositories";
import { getProIdsEligibleForNewWork } from "@/lib/pro-subscription-entitlement";

const openRequestStatuses = new Set(["submitted", "awaiting_quotes", "quoted"]);

function privateJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return privateJson({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "customer") {
    return privateJson({ error: "Customer access required" }, { status: 403 });
  }

  const requestDetail = await getCustomerRequestDetail(user.id, requestId);
  if (!requestDetail) {
    return privateJson({ error: "Request not found" }, { status: 404 });
  }

  const eligibleProIds = await getProIdsEligibleForNewWork();
  const db = await readDb();
  const requestCanAcceptQuote = openRequestStatuses.has(requestDetail.status);
  const quotes = requestDetail.quotes.map((quote) => ({
    id: quote.id,
    total: quote.total,
    includedWork: quote.includedWork,
    exclusions: quote.exclusions,
    earliestAvailability: quote.earliestAvailability,
    estimatedDurationMinutes: quote.estimatedDurationMinutes,
    noteToCustomer: quote.noteToCustomer,
    status: quote.status,
    canAccept:
      requestCanAcceptQuote &&
      quote.status === "sent" &&
      eligibleProIds.has(quote.proId),
    proName:
      db.proProfiles.find((profile) => profile.userId === quote.proId)
        ?.displayName ??
      db.users.find((user) => user.id === quote.proId)?.fullName ??
      "Pro",
  }));

  return privateJson(quotes);
}
