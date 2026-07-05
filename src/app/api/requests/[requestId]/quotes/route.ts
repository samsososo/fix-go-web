import { NextResponse } from "next/server";

import { readDb } from "@/lib/mock/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const db = await readDb();
  const quotes = db.quotes
    .filter((quote) => quote.requestId === requestId)
    .map((quote) => ({
      id: quote.id,
      total: quote.total,
      includedWork: quote.includedWork,
      exclusions: quote.exclusions,
      earliestAvailability: quote.earliestAvailability,
      estimatedDurationMinutes: quote.estimatedDurationMinutes,
      noteToCustomer: quote.noteToCustomer,
      status: quote.status,
      proName:
        db.proProfiles.find((profile) => profile.userId === quote.proId)
          ?.displayName ??
        db.users.find((user) => user.id === quote.proId)?.fullName ??
        "Pro",
    }));

  return NextResponse.json(quotes);
}
