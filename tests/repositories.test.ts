import { beforeEach, describe, expect, it } from "vitest";

import {
  acceptCustomerQuote,
  createCustomerRequest,
  getAdminRequestDetail,
  getLeadDetail,
  listAdminCalendarBookings,
  listAdminRequests,
  listCustomerCalendarBookings,
  listRelevantLeads,
  listProCalendarBookings,
  submitProQuote,
} from "@/lib/mock/repositories";
import { readDb } from "@/lib/mock/db";
import { resetMockDb } from "./helpers/mock-db";

describe("marketplace repositories", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  it("creates a customer service request for pros with matching specialties without storing attachments", async () => {
    const request = await createCustomerRequest(
      "user_customer_amy",
      {
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
      },
      "zh-HK",
    );

    expect(request.status).toBe("awaiting_quotes");
    expect(request.matchedProIds).toContain("user_pro_chan");
    expect(request.matchedProIds).not.toContain("user_pro_wong");
    expect(request.attachmentIds).toHaveLength(0);

    const db = await readDb();
    expect(
      db.attachments.some((attachment) => attachment.requestId === request.id),
    ).toBe(false);
  });

  it("lets pros see open requests and filter them by category", async () => {
    const request = await createCustomerRequest(
      "user_customer_ben",
      {
        title: "Need urgent plumbing help in Lam Tin",
        description:
          "Kitchen tap keeps leaking and the cabinet is getting wet overnight.",
        categoryId: "plumbing",
        subcategoryId: "leak",
        urgency: "asap",
        scheduledDate: "",
        budgetMin: 400,
        budgetMax: 900,
        accessNotes: "Please call before arrival",
        attachmentNames: [],
        address: {
          district: "Kwun Tong",
          area: "Lam Tin",
          buildingEstate: "Laguna City",
          block: "Block 9",
          floor: "8/F",
          flatRoom: "C",
          landmarkNotes: "Near the clubhouse",
        },
      },
      "zh-HK",
    );

    const allLeads = await listRelevantLeads("user_pro_chan");
    expect(allLeads.some((lead) => lead.id === request.id)).toBe(true);

    const plumbingLeads = await listRelevantLeads("user_pro_chan", "plumbing");
    expect(plumbingLeads.every((lead) => lead.categoryId === "plumbing")).toBe(
      true,
    );
    expect(plumbingLeads.some((lead) => lead.id === request.id)).toBe(true);

    const detail = await getLeadDetail("user_pro_chan", request.id);
    expect(detail?.id).toBe(request.id);

    const unrelatedProLeads = await listRelevantLeads(
      "user_pro_wong",
      "plumbing",
    );
    expect(unrelatedProLeads.some((lead) => lead.id === request.id)).toBe(
      false,
    );
    await expect(
      submitProQuote(
        "user_pro_wong",
        request.id,
        {
          quoteAmount: 700,
          labourEstimate: 500,
          partsEstimate: 100,
          callOutFee: 100,
          total: 700,
          includedWork: "Inspect and repair the leak.",
          exclusions: "Concealed pipe replacement is excluded.",
          earliestAvailability: "2026-04-04T09:00",
          estimatedDurationMinutes: 90,
          noteToCustomer: "Can visit tomorrow morning.",
        },
        "zh-HK",
      ),
    ).rejects.toThrow("Lead not found");
  });

  it("lets a pro submit a quote and moves the request into quoted state", async () => {
    const request = await createCustomerRequest(
      "user_customer_ben",
      {
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
      },
      "zh-HK",
    );

    const quote = await submitProQuote(
      "user_pro_wong",
      request.id,
      {
        quoteAmount: 900,
        labourEstimate: 500,
        partsEstimate: 250,
        callOutFee: 150,
        total: 900,
        includedWork:
          "Inspect socket and replace a standard faceplate if needed.",
        exclusions: "DB board replacement is excluded.",
        earliestAvailability: "2026-04-04T09:00",
        estimatedDurationMinutes: 120,
        noteToCustomer:
          "Can visit tomorrow morning and confirm final condition onsite.",
      },
      "zh-HK",
    );

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
    expect(detail).not.toBeNull();
    if (!detail) {
      return;
    }
    expect(detail.quotes.length).toBe(1);
    expect(detail.quotes[0]?.id).toBe("quote_1");
  });

  it("exposes accepted bookings in customer, pro, and admin calendars", async () => {
    await acceptCustomerQuote("user_customer_amy", "req_1", "quote_1", "zh-HK");

    const customerCalendar =
      await listCustomerCalendarBookings("user_customer_amy");
    const proCalendar = await listProCalendarBookings("user_pro_chan");
    const adminCalendar = await listAdminCalendarBookings();

    expect(customerCalendar[0]?.request?.title).toContain("冷氣滴水");
    expect(proCalendar[0]?.customer?.fullName).toBe("陳小姐");
    expect(proCalendar[0]?.estimatedDurationMinutes).toBe(120);
    expect(adminCalendar[0]?.quote?.total).toBe(780);
  });
});
