import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  clearSession: vi.fn(),
  localizedRoleHomePath: vi.fn((role: string) => `/${role}`),
  requireRole: vi.fn(),
  signInAs: vi.fn(),
  signInWithCredentials: vi.fn(),
}));

vi.mock("@/lib/mock/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mock/db")>();
  return {
    ...actual,
    setSmsVerificationEnabled: vi.fn(),
  };
});

vi.mock("@/lib/mock/repositories", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/mock/repositories")>();
  return {
    ...actual,
    acceptCustomerQuote: vi.fn(),
    createCustomerRequest: vi.fn(),
    saveProProfile: vi.fn(),
    submitProQuote: vi.fn(),
    toggleProVerification: vi.fn(),
    updateAdminRequestStatus: vi.fn(),
    updateProBookingStatus: vi.fn(),
  };
});

import { requireRole } from "@/lib/auth";
import {
  acceptQuoteAction,
  createRequestAction,
  saveProProfileAction,
  submitQuoteAction,
  toggleProVerificationAction,
  updateAdminRequestStatusAction,
  updateBookingStatusAction,
  updateSmsVerificationConfigAction,
} from "@/lib/actions";
import { setSmsVerificationEnabled } from "@/lib/mock/db";
import {
  acceptCustomerQuote,
  createCustomerRequest,
  saveProProfile,
  submitProQuote,
  toggleProVerification,
  updateAdminRequestStatus,
  updateProBookingStatus,
} from "@/lib/mock/repositories";
import { ProNewWorkRestrictedError } from "@/lib/pro-subscription-entitlement";
import type { User } from "@/types/domain";

const customer: User = {
  id: "customer_from_session",
  role: "customer",
  fullName: "Customer",
  email: "customer@action.test",
  phone: "91234567",
  locale: "zh-HK",
  createdAt: "2026-08-10T10:00:00.000Z",
  lastLoginAt: "2026-08-10T10:00:00.000Z",
};

const pro: User = {
  ...customer,
  id: "pro_from_session",
  role: "pro",
  fullName: "Pro",
  email: "pro@action.test",
  phone: "92345678",
};

const admin: User = {
  ...customer,
  id: "admin_from_session",
  role: "admin",
  fullName: "Admin",
  email: "admin@action.test",
  phone: "90000000",
};

const requestValues = {
  title: "Kitchen tap leak",
  description: "The kitchen tap is leaking continuously overnight.",
  categoryId: "plumbing",
  subcategoryId: "leak",
  urgency: "asap" as const,
  scheduledDate: "",
  budgetMin: 300,
  budgetMax: 800,
  accessNotes: "Call before arrival",
  attachmentNames: [],
  address: {
    district: "Kwun Tong",
    area: "Lam Tin",
    buildingEstate: "Laguna City",
    block: "12",
    floor: "8",
    flatRoom: "C",
    landmarkNotes: "Clubhouse",
  },
};

const quoteValues = {
  quoteAmount: 800,
  labourEstimate: 500,
  partsEstimate: 200,
  callOutFee: 100,
  total: 800,
  includedWork: "Inspect and repair the leaking kitchen tap.",
  exclusions: "Concealed pipe replacement is excluded.",
  earliestAvailability: "2026-08-11T09:00",
  estimatedDurationMinutes: 90,
  noteToCustomer: "I can visit tomorrow morning.",
};

const profileValues = {
  displayName: "Session-bound Pro",
  yearsOfExperience: 8,
  serviceCategoryIds: ["plumbing"],
  serviceAreaDistricts: ["Kwun Tong"],
  languagesSpoken: ["zh-HK" as const],
  introduction:
    "Experienced plumber providing careful household repair services.",
  emergencyAvailability: true,
  documentPlaceholders: [],
};

describe("session-bound marketplace actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a customer request for the authenticated customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(customer);
    vi.mocked(createCustomerRequest).mockResolvedValue({
      id: "req_action",
    } as never);

    await expect(
      createRequestAction({ locale: "zh-HK", values: requestValues }),
    ).resolves.toMatchObject({
      ok: true,
      target: "/customer/requests/req_action",
    });

    expect(requireRole).toHaveBeenCalledWith("customer", "zh-HK");
    expect(createCustomerRequest).toHaveBeenCalledWith(
      customer.id,
      requestValues,
      "zh-HK",
    );
  });

  it("accepts a quote only as the authenticated customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(customer);
    vi.mocked(acceptCustomerQuote).mockResolvedValue({
      id: "quote_1",
    } as never);

    await expect(
      acceptQuoteAction({
        locale: "zh-HK",
        requestId: "req_1",
        quoteId: "quote_1",
      }),
    ).resolves.toEqual({ ok: true });

    expect(acceptCustomerQuote).toHaveBeenCalledWith(
      customer.id,
      "req_1",
      "quote_1",
      "zh-HK",
    );
  });

  it("returns a stable customer-facing error when the selected pro is blocked", async () => {
    vi.mocked(requireRole).mockResolvedValue(customer);
    vi.mocked(acceptCustomerQuote).mockRejectedValue(
      new ProNewWorkRestrictedError(),
    );

    await expect(
      acceptQuoteAction({
        locale: "en",
        requestId: "req_1",
        quoteId: "quote_1",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "PRO_NEW_WORK_RESTRICTED",
      error: expect.stringContaining("temporarily unavailable"),
    });
  });

  it("keeps profile updates available and binds them to the session pro", async () => {
    vi.mocked(requireRole).mockResolvedValue(pro);

    await expect(
      saveProProfileAction({ locale: "zh-HK", values: profileValues }),
    ).resolves.toEqual({ ok: true });

    expect(saveProProfile).toHaveBeenCalledWith(pro.id, profileValues);
  });

  it("returns the stable restriction from the repository authorization gate", async () => {
    vi.mocked(requireRole).mockResolvedValue(pro);
    vi.mocked(submitProQuote).mockRejectedValue(
      new ProNewWorkRestrictedError(),
    );

    await expect(
      submitQuoteAction({
        locale: "zh-HK",
        requestId: "req_1",
        values: quoteValues,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "PRO_NEW_WORK_RESTRICTED",
    });
    expect(submitProQuote).toHaveBeenCalledWith(
      pro.id,
      "req_1",
      quoteValues,
      "zh-HK",
    );
  });

  it("submits an allowed quote as the authenticated pro", async () => {
    vi.mocked(requireRole).mockResolvedValue(pro);
    vi.mocked(submitProQuote).mockResolvedValue({} as never);

    await expect(
      submitQuoteAction({
        locale: "en",
        requestId: "req_1",
        values: quoteValues,
      }),
    ).resolves.toEqual({ ok: true });
    expect(submitProQuote).toHaveBeenCalledWith(
      pro.id,
      "req_1",
      quoteValues,
      "en",
    );
  });

  it("allows existing booking progress updates while using the session pro", async () => {
    vi.mocked(requireRole).mockResolvedValue(pro);
    vi.mocked(updateProBookingStatus).mockResolvedValue({
      id: "booking_1",
      requestId: "req_1",
    } as never);

    await expect(
      updateBookingStatusAction({
        locale: "zh-HK",
        bookingId: "booking_1",
        status: "in_progress",
      }),
    ).resolves.toEqual({ ok: true });
    expect(updateProBookingStatus).toHaveBeenCalledWith(
      pro.id,
      "booking_1",
      "in_progress",
      "zh-HK",
    );
  });

  it("binds admin mutations to the authenticated admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(admin);
    vi.mocked(updateAdminRequestStatus).mockResolvedValue({
      id: "req_1",
    } as never);

    await updateAdminRequestStatusAction({
      locale: "en",
      requestId: "req_1",
      status: "completed",
      note: "Done",
    });
    expect(updateAdminRequestStatus).toHaveBeenCalledWith(
      "req_1",
      "completed",
      admin.id,
      "Done",
      "en",
    );

    await toggleProVerificationAction({
      locale: "en",
      userId: "target_pro",
      verified: true,
    });
    expect(toggleProVerification).toHaveBeenCalledWith("target_pro", true);
    expect(requireRole).toHaveBeenCalledWith("admin", "en");

    await updateSmsVerificationConfigAction({
      locale: "en",
      enabled: true,
    });
    expect(setSmsVerificationEnabled).toHaveBeenCalledWith({
      enabled: true,
      updatedBy: admin.id,
    });
  });
});
