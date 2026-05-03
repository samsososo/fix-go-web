import { beforeEach, describe, expect, it } from "vitest";

import {
  createCustomerRequest,
  getAdminRequestDetail,
  listAdminRequests,
  submitProQuote,
} from "@/lib/mock/repositories";
import { readDb } from "@/lib/mock/db";
import { resetMockDb } from "./helpers/mock-db";

describe("marketplace repositories", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  it("creates a customer service request and matches relevant pros", async () => {
    const request = await createCustomerRequest("user_customer_amy", {
      title: "浴室水龍頭漏水，需要今晚前處理",
      description: "廁所洗手盤水龍頭持續漏水，希望今晚前安排師傅處理。",
      categoryId: "plumbing",
      subcategoryId: "leak",
      urgency: "today",
      scheduledDate: "",
      budgetMin: 300,
      budgetMax: 800,
      accessNotes: "大堂保安可協助放行",
      attachmentNames: ["tap.jpg"],
      address: {
        district: "Kwun Tong",
        area: "Lam Tin",
        buildingEstate: "Laguna City",
        block: "Block 12",
        floor: "10/F",
        flatRoom: "B",
        landmarkNotes: "Near Phase 4 gate",
      },
    });

    expect(request.status).toBe("awaiting_quotes");
    expect(request.matchedProIds).toContain("user_pro_chan");

    const db = await readDb();
    expect(
      db.attachments.some((attachment) => attachment.requestId === request.id),
    ).toBe(true);
  });

  it("lets a pro submit a quote and moves the request into quoted state", async () => {
    const request = await createCustomerRequest("user_customer_ben", {
      title: "Need socket repair in Tai Koo",
      description:
        "One living room socket has no power and the switch panel may be loose.",
      categoryId: "electrical",
      subcategoryId: "socket",
      urgency: "tomorrow",
      scheduledDate: "",
      budgetMin: 500,
      budgetMax: 1200,
      accessNotes: "Please call from lobby",
      attachmentNames: [],
      address: {
        district: "Eastern",
        area: "Tai Koo",
        buildingEstate: "Kornhill",
        block: "Block C",
        floor: "15/F",
        flatRoom: "3",
        landmarkNotes: "Near exit C",
      },
    });

    const quote = await submitProQuote("user_pro_wong", request.id, {
      quoteAmount: 900,
      labourEstimate: 500,
      partsEstimate: 250,
      callOutFee: 150,
      total: 900,
      includedWork:
        "Inspect socket and replace a standard faceplate if needed.",
      exclusions: "DB board replacement is excluded.",
      earliestAvailability: "2026-04-04T09:00",
      noteToCustomer:
        "Can visit tomorrow morning and confirm final condition onsite.",
    });

    expect(quote.status).toBe("sent");

    const db = await readDb();
    expect(db.requests.find((entry) => entry.id === request.id)?.status).toBe(
      "quoted",
    );
  });

  it("provides admin list and detail views over requests and quotes", async () => {
    const requests = await listAdminRequests("all");
    expect(requests.length).toBeGreaterThan(0);
    expect(requests[0]?.customer?.fullName).toBeTruthy();

    const detail = await getAdminRequestDetail("req_1");
    expect(detail.quotes.length).toBe(1);
    expect(detail.quotes[0]?.id).toBe("quote_1");
  });
});
