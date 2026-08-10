import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/mock/db", () => ({
  readDb: vi.fn(),
}));

vi.mock("@/lib/mock/repositories", () => ({
  getCustomerRequestDetail: vi.fn(),
}));

vi.mock("@/lib/pro-subscription-entitlement", () => ({
  getProIdsEligibleForNewWork: vi.fn(),
}));

import { GET } from "@/app/api/requests/[requestId]/quotes/route";
import { getCurrentUser } from "@/lib/auth";
import { readDb } from "@/lib/mock/db";
import { getCustomerRequestDetail } from "@/lib/mock/repositories";
import { getProIdsEligibleForNewWork } from "@/lib/pro-subscription-entitlement";
import type { User } from "@/types/domain";

const customer: User = {
  id: "user_customer_api",
  role: "customer",
  fullName: "API Customer",
  email: "customer-api@hotfix.test",
  phone: "91234567",
  locale: "zh-HK",
  createdAt: "2026-08-10T10:00:00.000Z",
  lastLoginAt: "2026-08-10T10:00:00.000Z",
};

function callQuotesApi(requestId = "req_api") {
  return GET(new Request(`http://localhost/api/requests/${requestId}/quotes`), {
    params: Promise.resolve({ requestId }),
  });
}

describe("customer quotes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects anonymous requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await callQuotesApi();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required",
    });
    expect(readDb).not.toHaveBeenCalled();
  });

  it("does not expose a request owned by another customer", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(customer);
    vi.mocked(getCustomerRequestDetail).mockResolvedValue(null);

    const response = await callQuotesApi("req_someone_else");
    expect(response.status).toBe(404);
    expect(getCustomerRequestDetail).toHaveBeenCalledWith(
      customer.id,
      "req_someone_else",
    );
    expect(readDb).not.toHaveBeenCalled();
  });

  it("marks only currently eligible sent quotes as acceptable", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(customer);
    vi.mocked(getCustomerRequestDetail).mockResolvedValue({
      id: "req_api",
      status: "quoted",
      quotes: [
        {
          id: "quote_available",
          requestId: "req_api",
          proId: "pro_available",
          total: 800,
          includedWork: "Repair",
          exclusions: "Parts",
          earliestAvailability: "2026-08-11T10:00:00.000Z",
          estimatedDurationMinutes: 60,
          noteToCustomer: "Available tomorrow",
          status: "sent",
        },
        {
          id: "quote_blocked",
          requestId: "req_api",
          proId: "pro_blocked",
          total: 900,
          includedWork: "Repair",
          exclusions: "Parts",
          earliestAvailability: "2026-08-12T10:00:00.000Z",
          estimatedDurationMinutes: 90,
          noteToCustomer: "Available later",
          status: "sent",
        },
      ],
    } as never);
    vi.mocked(getProIdsEligibleForNewWork).mockResolvedValue(
      new Set(["pro_available"]),
    );
    vi.mocked(readDb).mockResolvedValue({
      proProfiles: [
        { userId: "pro_available", displayName: "Available Pro" },
        { userId: "pro_blocked", displayName: "Blocked Pro" },
      ],
      users: [],
    } as never);

    const response = await callQuotesApi();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as Array<{
      id: string;
      canAccept: boolean;
    }>;
    expect(body).toEqual([
      expect.objectContaining({ id: "quote_available", canAccept: true }),
      expect.objectContaining({ id: "quote_blocked", canAccept: false }),
    ]);
  });

  it("never permits another quote once the request is no longer open", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(customer);
    vi.mocked(getCustomerRequestDetail).mockResolvedValue({
      id: "req_api",
      status: "accepted",
      quotes: [
        {
          id: "quote_accepted",
          requestId: "req_api",
          proId: "pro_available",
          total: 800,
          includedWork: "Repair",
          exclusions: "Parts",
          earliestAvailability: "2026-08-11T10:00:00.000Z",
          estimatedDurationMinutes: 60,
          noteToCustomer: "Available tomorrow",
          status: "sent",
        },
      ],
    } as never);
    vi.mocked(getProIdsEligibleForNewWork).mockResolvedValue(
      new Set(["pro_available"]),
    );
    vi.mocked(readDb).mockResolvedValue({
      proProfiles: [],
      users: [],
    } as never);

    const response = await callQuotesApi();
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ canAccept: false }),
    ]);
  });
});
