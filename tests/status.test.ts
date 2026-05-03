import { describe, expect, it } from "vitest";

import {
  bookingStatusTransitions,
  canTransitionBookingStatus,
  canTransitionRequestStatus,
} from "@/lib/status";

describe("status transitions", () => {
  it("allows valid request transitions", () => {
    expect(canTransitionRequestStatus("awaiting_quotes", "quoted")).toBe(true);
    expect(canTransitionRequestStatus("quoted", "accepted")).toBe(true);
  });

  it("rejects invalid booking transitions", () => {
    expect(canTransitionBookingStatus("accepted", "completed")).toBe(false);
    expect(bookingStatusTransitions.in_progress).toContain("completed");
  });
});
